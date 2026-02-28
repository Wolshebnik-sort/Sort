import * as vscode from 'vscode';

import {
  collectBraceBlock,
  collectFunctionBlock,
  collectImportBlock,
  collectTypeBlock,
  isFunctionLikeStart,
} from './sortImports/blockCollectors';
import { getSortConfig } from './sortImports/config';
import {
  compareImportStatements,
  compareStrings,
  formatImportBlock,
  getImportGroup,
  mergeImportStatements,
  sortTypeMembers,
} from './sortImports/importFormatting';
import { GroupKey, GroupOrderItem, ImportGroups, SortConfig } from './sortImports/types';

type RawSectionPart = { type: 'raw'; value: string };
type ConfiguredSectionPart = { type: 'configured'; groups: ImportGroups };
type SectionPart = RawSectionPart | ConfiguredSectionPart;

export class SortImportsProvider {
  public async sortImports(editor: vscode.TextEditor): Promise<boolean> {
    const document = editor.document;
    const content = document.getText();
    const sortedContent = this.getSortedContent(document);

    if (sortedContent === content) {
      return false;
    }

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(content.length)
    );

    edit.replace(document.uri, fullRange, sortedContent);
    return vscode.workspace.applyEdit(edit);
  }

  public getFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
    const content = document.getText();
    const sortedContent = this.getSortedContent(document);

    if (sortedContent === content) {
      return [];
    }

    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(content.length)
    );

    return [vscode.TextEdit.replace(fullRange, sortedContent)];
  }

  public getSortedContent(document: vscode.TextDocument): string {
    return this.processContent(document.getText(), getSortConfig(document.uri));
  }

  private processContent(content: string, config: SortConfig): string {
    const lines = content.split(/\r?\n/);
    const configuredGroups = this.getConfiguredGroups(config.groupsOrder);
    const sectionParts: SectionPart[] = [];
    let currentConfiguredPart: ConfiguredSectionPart | null = null;
    let commentIndex = 0;
    let idx = 0;

    while (lines[idx]?.trim() === '') {
      idx++;
    }

    while (idx < lines.length) {
      const line = lines[idx].trim();

      if (!line) {
        idx++;
        continue;
      }

      const directive = line.match(/^['"](use (?:client|server))['"]\.?;?$/i);
      if (directive) {
        currentConfiguredPart = this.pushSectionEntry(
          sectionParts,
          currentConfiguredPart,
          configuredGroups,
          'directives',
          `'${directive[1]}';`
        );
        idx++;
        continue;
      }

      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        currentConfiguredPart = this.pushCommentEntry(
          sectionParts,
          currentConfiguredPart,
          configuredGroups,
          lines[idx],
          commentIndex
        );
        commentIndex++;
        idx++;
        continue;
      }

      if (line.startsWith('interface ') || line.startsWith('export interface ')) {
        const interfaceResult = collectBraceBlock(lines, idx);
        if (!interfaceResult) {
          break;
        }

        currentConfiguredPart = this.pushSectionEntry(
          sectionParts,
          currentConfiguredPart,
          configuredGroups,
          'interfaces',
          sortTypeMembers(interfaceResult.block, config)
        );
        idx = interfaceResult.nextIdx;
        continue;
      }

      if (line.startsWith('type ') || line.startsWith('export type ')) {
        const typeResult = collectTypeBlock(lines, idx);
        if (!typeResult) {
          break;
        }

        currentConfiguredPart = this.pushSectionEntry(
          sectionParts,
          currentConfiguredPart,
          configuredGroups,
          'interfaces',
          sortTypeMembers(typeResult.block, config)
        );
        idx = typeResult.nextIdx;
        continue;
      }

      if (isFunctionLikeStart(line)) {
        const functionResult = collectFunctionBlock(lines, idx);
        if (!functionResult) {
          break;
        }

        currentConfiguredPart = this.pushSectionEntry(
          sectionParts,
          currentConfiguredPart,
          configuredGroups,
          'functions',
          functionResult.block
        );
        idx = functionResult.nextIdx;
        continue;
      }

      if (!line.startsWith('import')) {
        break;
      }

      const importResult = collectImportBlock(lines, idx);
      if (!importResult) {
        break;
      }

      const importGroup = getImportGroup(importResult.block, config);
      if (!importGroup) {
        break;
      }

      const blockValue = configuredGroups.has(importGroup)
        ? formatImportBlock(importResult.block, config)
        : importResult.block;

      currentConfiguredPart = this.pushSectionEntry(
        sectionParts,
        currentConfiguredPart,
        configuredGroups,
        importGroup,
        blockValue
      );
      idx = importResult.nextIdx;
    }

    if (currentConfiguredPart) {
      sectionParts.push(currentConfiguredPart);
    }

    const rest = lines.slice(idx).join('\n').trim();
    const renderedParts = sectionParts
      .map((part) =>
        part.type === 'raw' ? part.value : this.buildConfiguredPart(part.groups, config)
      )
      .filter(Boolean);
    const section = renderedParts.reduce((result, part, index) => {
      if (index === 0) {
        return part;
      }

      const previousPart = sectionParts[index - 1];
      const currentPart = sectionParts[index];
      const separator =
        previousPart?.type === 'raw' && currentPart?.type === 'raw' ? '\n' : '\n\n';

      return `${result}${separator}${part}`;
    }, '');

    if (!section && !rest) {
      return '\n';
    }

    if (!section) {
      return `${rest}\n`;
    }

    if (!rest) {
      return `${section}\n`;
    }

    return `${section}\n\n${rest}`.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  private pushSectionEntry(
    sectionParts: SectionPart[],
    currentConfiguredPart: ConfiguredSectionPart | null,
    configuredGroups: Set<GroupKey>,
    group: Exclude<GroupKey, 'comments'>,
    value: string
  ): ConfiguredSectionPart | null {
    if (!configuredGroups.has(group)) {
      if (currentConfiguredPart) {
        sectionParts.push(currentConfiguredPart);
      }

      sectionParts.push({ type: 'raw', value });
      return null;
    }

    const configuredPart = currentConfiguredPart ?? {
      type: 'configured' as const,
      groups: this.createEmptyGroups(),
    };

    configuredPart.groups[group].push(value);
    return configuredPart;
  }

  private pushCommentEntry(
    sectionParts: SectionPart[],
    currentConfiguredPart: ConfiguredSectionPart | null,
    configuredGroups: Set<GroupKey>,
    line: string,
    originalIndex: number
  ): ConfiguredSectionPart | null {
    if (!configuredGroups.has('comments')) {
      if (currentConfiguredPart) {
        sectionParts.push(currentConfiguredPart);
      }

      sectionParts.push({ type: 'raw', value: line });
      return null;
    }

    const configuredPart = currentConfiguredPart ?? {
      type: 'configured' as const,
      groups: this.createEmptyGroups(),
    };

    configuredPart.groups.comments.push({ line, originalIndex });
    return configuredPart;
  }

  private createEmptyGroups(): ImportGroups {
    return {
      directives: [],
      react: [],
      libraries: [],
      absolute: [],
      relative: [],
      sideEffect: [],
      styles: [],
      comments: [],
      interfaces: [],
      functions: [],
    };
  }

  private getConfiguredGroups(groupsOrder: GroupOrderItem[]): Set<GroupKey> {
    return new Set(
      groupsOrder.filter((group): group is GroupKey => group !== '__separator__')
    );
  }

  private buildConfiguredPart(groups: ImportGroups, config: SortConfig): string {
    const parts: string[] = [];
    let pendingBlankLine = false;

    for (const group of config.groupsOrder) {
      if (group === '__separator__') {
        pendingBlankLine = parts.length > 0;
        continue;
      }

      const block = this.getGroupBlock(group, groups, config);
      if (!block) {
        continue;
      }

      if (parts.length > 0) {
        parts.push(pendingBlankLine ? '\n\n' : '\n');
      }

      parts.push(block);
      pendingBlankLine = false;
    }

    return parts.join('');
  }

  private getGroupBlock(
    group: GroupKey,
    groups: ImportGroups,
    config: SortConfig
  ): string | null {
    const prepareImports = (items: string[]) =>
      config.mergeDuplicateImports ? mergeImportStatements(items, config) : [...items];
    const sortByMode = (a: string, b: string) =>
      config.sortMode === 'alphabetical'
        ? compareImportStatements(a, b, config.sortMode)
        : compareStrings(a, b, config.sortMode);
    const sortByLength = (a: string, b: string) => compareStrings(a, b, 'length');
    const mergeAndSort = (items: string[]) =>
      prepareImports(items).sort(sortByMode).join('\n');

    switch (group) {
      case 'directives':
        return groups.directives.length ? groups.directives.join('\n') : null;
      case 'react':
        if (!groups.react.length) {
          return null;
        }
        return config.sortMode === 'alphabetical'
          ? mergeAndSort(groups.react)
          : prepareImports(groups.react).sort(sortByLength).join('\n');
      case 'libraries':
        return groups.libraries.length ? mergeAndSort(groups.libraries) : null;
      case 'absolute':
        return groups.absolute.length ? mergeAndSort(groups.absolute) : null;
      case 'relative':
        return groups.relative.length ? mergeAndSort(groups.relative) : null;
      case 'sideEffect':
        return groups.sideEffect.length ? mergeAndSort(groups.sideEffect) : null;
      case 'styles':
        return groups.styles.length ? mergeAndSort(groups.styles) : null;
      case 'interfaces':
        return groups.interfaces.length ? groups.interfaces.join('\n') : null;
      case 'comments':
        if (!groups.comments.length) {
          return null;
        }
        return [...groups.comments]
          .sort((a, b) => a.originalIndex - b.originalIndex)
          .map((comment) => comment.line)
          .join('\n');
      case 'functions':
        return groups.functions.length ? groups.functions.join('\n\n') : null;
      default:
        return null;
    }
  }
}

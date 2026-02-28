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
  classifyImport,
  compareImportStatements,
  compareStrings,
  mergeImportStatements,
  sortTypeMembers,
} from './sortImports/importFormatting';
import { GroupKey, ImportGroups, SortConfig } from './sortImports/types';

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
    return this.processContent(document.getText(), getSortConfig());
  }

  private processContent(content: string, config: SortConfig): string {
    const lines = content.split(/\r?\n/);
    const groups = this.createEmptyGroups();

    const startIdx = this.processDirectives(lines, groups);
    const nextIdx = this.processImports(lines, startIdx, groups, config);

    return this.buildResult(lines, nextIdx, groups, config);
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

  private processDirectives(lines: string[], groups: ImportGroups): number {
    for (let i = 0; i < lines.length; i++) {
      const directive = lines[i].trim().match(/^['"](use (?:client|server))['"]\.?;?$/i);
      if (directive) {
        groups.directives.push(`'${directive[1]}';`);
        lines[i] = '';
      }
    }

    let idx = 0;
    while (lines[idx]?.trim() === '') {
      idx++;
    }

    return idx;
  }

  private processImports(
    lines: string[],
    startIdx: number,
    groups: ImportGroups,
    config: SortConfig
  ): number {
    let idx = startIdx;

    while (idx < lines.length) {
      const line = lines[idx].trim();

      if (!line) {
        idx++;
        continue;
      }

      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        groups.comments.push({ line: lines[idx], originalIndex: idx });
        idx++;
        continue;
      }

      if (line.startsWith('interface ') || line.startsWith('export interface ')) {
        const interfaceResult = collectBraceBlock(lines, idx);
        if (!interfaceResult) {
          break;
        }

        groups.interfaces.push(sortTypeMembers(interfaceResult.block, config));
        idx = interfaceResult.nextIdx;
        continue;
      }

      if (line.startsWith('type ') || line.startsWith('export type ')) {
        const typeResult = collectTypeBlock(lines, idx);
        if (!typeResult) {
          break;
        }

        groups.interfaces.push(sortTypeMembers(typeResult.block, config));
        idx = typeResult.nextIdx;
        continue;
      }

      if (isFunctionLikeStart(line)) {
        const functionResult = collectFunctionBlock(lines, idx);
        if (!functionResult) {
          break;
        }

        groups.functions.push(functionResult.block);
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

      classifyImport(importResult.block, groups, config);
      idx = importResult.nextIdx;
    }

    return idx;
  }

  private buildResult(
    lines: string[],
    startIdx: number,
    groups: ImportGroups,
    config: SortConfig
  ): string {
    const rest = lines.slice(startIdx).join('\n').trim();
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

    if (rest) {
      if (parts.length > 0) {
        parts.push(pendingBlankLine ? '\n\n' : '\n');
      }
      parts.push(rest);
    }

    return parts.join('').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  private getGroupBlock(
    group: GroupKey,
    groups: ImportGroups,
    config: SortConfig
  ): string | null {
    const mergeAndSort = (items: string[]) =>
      mergeImportStatements(items, config).sort(sortByMode).join('\n');
    const sortByMode = (a: string, b: string) =>
      config.sortMode === 'alphabetical'
        ? compareImportStatements(a, b, config.sortMode)
        : compareStrings(a, b, config.sortMode);
    const sortByLength = (a: string, b: string) => compareStrings(a, b, 'length');

    switch (group) {
      case 'directives':
        return groups.directives.length ? groups.directives.join('\n') : null;
      case 'react':
        if (!groups.react.length) {
          return null;
        }
        return config.sortMode === 'alphabetical'
          ? mergeAndSort(groups.react)
          : mergeImportStatements(groups.react, config).sort(sortByLength).join('\n');
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

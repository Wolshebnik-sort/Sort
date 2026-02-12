import * as vscode from 'vscode';

interface ImportGroups {
  directives: string[];
  react: string[];
  libraries: string[];
  absolute: string[];
  relative: string[];
  sideEffect: string[];
  styles: string[];
  comments: { line: string; originalIndex: number }[];
  interfaces: string[];
  functions: string[];
}

type GroupKey =
  | 'directives'
  | 'react'
  | 'libraries'
  | 'absolute'
  | 'relative'
  | 'sideEffect'
  | 'styles'
  | 'interfaces'
  | 'comments'
  | 'functions';

const DEFAULT_GROUP_ORDER: GroupKey[] = [
  'directives',
  'react',
  'libraries',
  'absolute',
  'relative',
  'sideEffect',
  'styles',
  'interfaces',
  'comments',
  'functions',
];

interface SortConfig {
  maxLineLength: number;
  indent: string;
  aliasPrefixes: string[];
  sortMode: 'length' | 'alphabetical';
  styleExtensions: string[];
  groupsOrder: GroupKey[];
}

export class SortImportsProvider {
  private getConfig(): SortConfig {
    const config = vscode.workspace.getConfiguration('sortImports');
    const styleExtensions = this.normalizeStyleExtensions(
      config.get<string[]>('styleExtensions', ['.css', '.scss', '.sass', '.less'])
    );
    const groupsOrder = this.normalizeGroupsOrder(
      config.get<string[]>('groupsOrder', DEFAULT_GROUP_ORDER)
    );

    return {
      maxLineLength: config.get<number>('maxLineLength', 100),
      indent: config.get<string>('indentSize', '  '),
      aliasPrefixes: config.get<string[]>('aliasPrefixes', ['@/', '~/', 'src/']),
      sortMode: config.get<'length' | 'alphabetical'>('sortMode', 'length'),
      styleExtensions,
      groupsOrder,
    };
  }

  public async sortImports(editor: vscode.TextEditor): Promise<boolean> {
    const document = editor.document;
    const config = this.getConfig();

    const content = document.getText();
    const sortedContent = this.processContent(content, config);

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
    const config = this.getConfig();
    const content = document.getText();
    const sortedContent = this.processContent(content, config);

    if (sortedContent !== content) {
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(content.length)
      );
      return [vscode.TextEdit.replace(fullRange, sortedContent)];
    }

    return [];
  }

  private processContent(content: string, config: SortConfig): string {
    const lines = content.split(/\r?\n/);
    let idx = 0;

    const groups: ImportGroups = {
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

    idx = this.processDirectives(lines, idx, groups);
    idx = this.processImports(lines, idx, groups, config);

    return this.buildResult(lines, idx, groups, config);
  }

  private processDirectives(
    lines: string[],
    startIdx: number,
    groups: ImportGroups
  ): number {
    // Find directives anywhere in file and move them to top.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const directive = line.match(/^['"](use (?:client|server))['"]\.?;?$/i);
      if (directive) {
        groups.directives.push(`'${directive[1]}';`);
        lines[i] = '';
      }
    }

    let idx = startIdx;
    while (lines[idx]?.trim() === '') idx++;

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

      if (
        line.startsWith('//') ||
        line.startsWith('/*') ||
        line.startsWith('*')
      ) {
        groups.comments.push({ line: lines[idx], originalIndex: idx });
        idx++;
        continue;
      }

      if (
        line.startsWith('interface ') ||
        line.startsWith('export interface ')
      ) {
        const interfaceResult = this.collectBraceBlock(lines, idx);
        if (!interfaceResult) {
          break;
        }

        groups.interfaces.push(
          this.sortInterfaceProperties(interfaceResult.block, config)
        );
        idx = interfaceResult.nextIdx;
        continue;
      }

      if (line.startsWith('type ') || line.startsWith('export type ')) {
        const typeResult = this.collectTypeBlock(lines, idx);
        if (!typeResult) {
          break;
        }

        groups.interfaces.push(typeResult.block);
        idx = typeResult.nextIdx;
        continue;
      }

      if (this.isFunctionLikeStart(line)) {
        const functionResult = this.collectFunctionBlock(lines, idx);
        if (!functionResult) {
          break;
        }

        groups.functions.push(functionResult.block);
        idx = functionResult.nextIdx;
        continue;
      }

      if (!line.startsWith('import')) break;

      const importResult = this.collectImportBlock(lines, idx);
      if (!importResult) {
        break;
      }

      this.classifyImport(importResult.block, groups, config);
      idx = importResult.nextIdx;
    }

    return idx;
  }

  private collectImportBlock(
    lines: string[],
    startIdx: number
  ): { block: string; nextIdx: number } | null {
    let idx = startIdx;
    const blockLines: string[] = [];

    while (idx < lines.length) {
      blockLines.push(lines[idx]);
      idx++;

      const block = blockLines.join('\n').trim();
      if (this.isCompleteImport(block)) {
        return { block, nextIdx: idx };
      }

      if (idx < lines.length && !lines[idx].trim()) {
        break;
      }
    }

    return null;
  }

  private isCompleteImport(block: string): boolean {
    const normalized = block.replace(/\s+/g, ' ').trim();

    if (/^import\s+type\s+['"][^'"]+['"]\s*;?$/.test(normalized)) {
      return true;
    }

    if (/^import\s+['"][^'"]+['"]\s*;?$/.test(normalized)) {
      return true;
    }

    if (/^import\b[\s\S]*\bfrom\s+['"][^'"]+['"]\s*;?$/.test(normalized)) {
      return true;
    }

    return false;
  }

  private isFunctionLikeStart(line: string): boolean {
    return (
      line.startsWith('export const ') ||
      line.startsWith('const ') ||
      line.startsWith('export function ') ||
      line.startsWith('function ') ||
      line.startsWith('export default ') ||
      line.startsWith('export {')
    );
  }

  private collectFunctionBlock(
    lines: string[],
    startIdx: number
  ): { block: string; nextIdx: number } | null {
    const firstLine = lines[startIdx].trim();

    if (firstLine.endsWith(';')) {
      return { block: lines[startIdx], nextIdx: startIdx + 1 };
    }

    if (!firstLine.includes('{')) {
      return null;
    }

    return this.collectBraceBlock(lines, startIdx);
  }

  private collectBraceBlock(
    lines: string[],
    startIdx: number
  ): { block: string; nextIdx: number } | null {
    let idx = startIdx;
    let braceCount = 0;
    let foundOpenBrace = false;
    let block = '';

    while (idx < lines.length) {
      const currentLine = lines[idx];
      block += currentLine + '\n';

      for (const char of currentLine) {
        if (char === '{') {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === '}') {
          braceCount--;
        }
      }

      idx++;

      if (foundOpenBrace && braceCount === 0) {
        return { block: block.trim(), nextIdx: idx };
      }
    }

    return null;
  }

  private collectTypeBlock(
    lines: string[],
    startIdx: number
  ): { block: string; nextIdx: number } | null {
    let idx = startIdx;
    const blockLines: string[] = [];
    let braceCount = 0;
    let parenCount = 0;
    let bracketCount = 0;

    while (idx < lines.length) {
      const currentLine = lines[idx];
      blockLines.push(currentLine);

      for (const ch of currentLine) {
        if (ch === '{') braceCount++;
        else if (ch === '}') braceCount--;
        else if (ch === '(') parenCount++;
        else if (ch === ')') parenCount--;
        else if (ch === '[') bracketCount++;
        else if (ch === ']') bracketCount--;
      }

      idx++;

      const trimmed = currentLine.trim();
      const isComplete =
        braceCount <= 0 &&
        parenCount <= 0 &&
        bracketCount <= 0 &&
        (trimmed.endsWith(';') || trimmed.endsWith('}'));

      if (isComplete) {
        return { block: blockLines.join('\n').trim(), nextIdx: idx };
      }
    }

    return null;
  }

  private sortInterfaceProperties(interfaceBlock: string, config: SortConfig): string {
    const openBraceIdx = interfaceBlock.indexOf('{');
    const closeBraceIdx = interfaceBlock.lastIndexOf('}');

    if (openBraceIdx === -1 || closeBraceIdx === -1 || closeBraceIdx <= openBraceIdx) {
      return interfaceBlock;
    }

    const header = interfaceBlock.slice(0, openBraceIdx + 1);
    const body = interfaceBlock.slice(openBraceIdx + 1, closeBraceIdx);
    const footer = interfaceBlock.slice(closeBraceIdx);

    const sortedProperties = body
      .split('\n')
      .filter((line) => line.trim())
      .sort((a, b) => this.compareStrings(a.trim(), b.trim(), config.sortMode))
      .join('\n');

    return `${header}\n${sortedProperties}\n${footer}`;
  }

  private classifyImport(
    block: string,
    groups: ImportGroups,
    config: SortConfig
  ): void {
    const normalizedBlock = block.replace(/\s+/g, ' ').trim();
    const sideEffectMatch = normalizedBlock.match(/^import\s+['"]([^'"]+)['"]\s*;?$/);

    if (sideEffectMatch) {
      const source = sideEffectMatch[1];
      if (this.isStyleImport(source, config.styleExtensions)) {
        groups.styles.push(this.formatBlock(block, config));
      } else {
        groups.sideEffect.push(this.formatBlock(block, config));
      }
      return;
    }

    const sourceMatch = normalizedBlock.match(/\bfrom\s+['"]([^'"]+)['"]\s*;?$/);
    if (!sourceMatch) {
      return;
    }

    const source = sourceMatch[1];
    const formatted = this.formatBlock(block, config);

    if (this.isStyleImport(source, config.styleExtensions)) {
      groups.styles.push(formatted);
    } else if (source === 'react' || source.startsWith('react/')) {
      groups.react.push(formatted);
    } else if (this.isAliasImport(source, config.aliasPrefixes)) {
      groups.absolute.push(formatted);
    } else if (source.startsWith('.') || source.startsWith('/')) {
      groups.relative.push(formatted);
    } else if (this.isExternalLib(source, config.aliasPrefixes)) {
      groups.libraries.push(formatted);
    } else {
      groups.absolute.push(formatted);
    }
  }

  private formatBlock(block: string, config: SortConfig): string {
    if (!block.includes('{')) return block;

    const normalizedBlock = block.replace(/\s+/g, ' ').trim();
    const [importPart, fromPart] = normalizedBlock.split(/\s+from\s+/);

    if (!fromPart) return block;

    const importsMatch = importPart.match(/import\s*\{([^}]+)\}/);
    if (!importsMatch) return block;

    const imports = importsMatch[1]
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .sort((a, b) => this.compareStrings(a, b, config.sortMode));

    const singleLineImports = `{ ${imports.join(', ')} }`;
    const singleLineResult = `import ${singleLineImports} from ${fromPart}`;

    const formattedImports =
      singleLineResult.length > config.maxLineLength
        ? `{\n${config.indent}${imports.join(`,\n${config.indent}`)},\n}`
        : singleLineImports;

    return `import ${formattedImports} from ${fromPart}`;
  }

  private isExternalLib(source: string, aliasPrefixes: string[]): boolean {
    return (
      !source.startsWith('.') &&
      !source.startsWith('/') &&
      !this.isAliasImport(source, aliasPrefixes)
    );
  }

  private isAliasImport(source: string, aliasPrefixes: string[]): boolean {
    return aliasPrefixes.some((prefix) => {
      const trimmed = prefix.trim();
      if (!trimmed) return false;

      if (trimmed.endsWith('/')) {
        return source.startsWith(trimmed);
      }

      return source === trimmed || source.startsWith(`${trimmed}/`);
    });
  }

  private buildResult(
    lines: string[],
    startIdx: number,
    groups: ImportGroups,
    config: SortConfig
  ): string {
    const blocks: string[] = [];
    const rest = lines.slice(startIdx).join('\n').trim();

    for (const group of config.groupsOrder) {
      const block = this.getGroupBlock(group, groups, config);
      if (block) {
        blocks.push(block);
      }
    }

    if (rest) {
      blocks.push(rest);
    }

    return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  private compareStrings(
    a: string,
    b: string,
    mode: 'length' | 'alphabetical'
  ): number {
    if (mode === 'alphabetical') {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    }

    return a.length - b.length || a.localeCompare(b, undefined, { sensitivity: 'base' });
  }

  private normalizeStyleExtensions(extensions: string[]): string[] {
    const normalized = new Set<string>();

    for (const ext of extensions) {
      const trimmed = ext.trim().toLowerCase();
      if (!trimmed) {
        continue;
      }
      normalized.add(trimmed.startsWith('.') ? trimmed : `.${trimmed}`);
    }

    if (normalized.size === 0) {
      return ['.css', '.scss', '.sass', '.less'];
    }

    return [...normalized];
  }

  private normalizeGroupsOrder(groupsOrder: string[]): GroupKey[] {
    const valid = new Set<GroupKey>(DEFAULT_GROUP_ORDER);
    const result: GroupKey[] = [];

    for (const group of groupsOrder) {
      if (valid.has(group as GroupKey) && !result.includes(group as GroupKey)) {
        result.push(group as GroupKey);
      }
    }

    for (const defaultGroup of DEFAULT_GROUP_ORDER) {
      if (!result.includes(defaultGroup)) {
        result.push(defaultGroup);
      }
    }

    return result;
  }

  private isStyleImport(source: string, styleExtensions: string[]): boolean {
    const normalized = source.toLowerCase();
    return styleExtensions.some((ext) => normalized.endsWith(ext));
  }

  private getGroupBlock(
    group: GroupKey,
    groups: ImportGroups,
    config: SortConfig
  ): string | null {
    const sortByMode = (a: string, b: string) =>
      this.compareStrings(a, b, config.sortMode);
    const sortByLength = (a: string, b: string) => this.compareStrings(a, b, 'length');

    switch (group) {
      case 'directives':
        return groups.directives.length ? groups.directives.join('\n') : null;
      case 'react':
        if (!groups.react.length) return null;
        return config.sortMode === 'alphabetical'
          ? groups.react.join('\n')
          : [...groups.react].sort(sortByLength).join('\n');
      case 'libraries':
        return groups.libraries.length ? [...groups.libraries].sort(sortByMode).join('\n') : null;
      case 'absolute':
        return groups.absolute.length ? [...groups.absolute].sort(sortByMode).join('\n') : null;
      case 'relative':
        return groups.relative.length ? [...groups.relative].sort(sortByMode).join('\n') : null;
      case 'sideEffect':
        return groups.sideEffect.length ? [...groups.sideEffect].sort(sortByMode).join('\n') : null;
      case 'styles':
        return groups.styles.length ? [...groups.styles].sort(sortByMode).join('\n') : null;
      case 'interfaces':
        return groups.interfaces.length ? groups.interfaces.join('\n') : null;
      case 'comments': {
        if (!groups.comments.length) return null;
        const sortedComments = [...groups.comments]
          .sort((a, b) => a.originalIndex - b.originalIndex)
          .map((comment) => comment.line);
        return sortedComments.join('\n');
      }
      case 'functions':
        return groups.functions.length ? groups.functions.join('\n\n') : null;
      default:
        return null;
    }
  }
}

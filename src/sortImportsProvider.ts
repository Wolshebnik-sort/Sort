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

type GroupOrderItem = GroupKey | '__separator__';

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

const DEFAULT_GROUP_ORDER_WITH_SEPARATORS: string[] = [
  'directives',
  'spacing',
  'react',
  'spacing',
  'libraries',
  'spacing',
  'absolute',
  'spacing',
  'relative',
  'spacing',
  'sideEffect',
  'spacing',
  'styles',
  'spacing',
  'interfaces',
  'spacing',
  'comments',
  'spacing',
  'functions',
];

interface SortConfig {
  maxLineLength: number;
  indent: string;
  aliasPrefixes: string[];
  sortMode: 'length' | 'alphabetical';
  styleExtensions: string[];
  groupsOrder: GroupOrderItem[];
}

interface ParsedImportBlock {
  source: string;
  quote: string;
  importClause: string | null;
  isTypeOnly: boolean;
  hasSemicolon: boolean;
}

export class SortImportsProvider {
  private getConfig(): SortConfig {
    const config = vscode.workspace.getConfiguration('sortImports');
    const styleExtensions = this.normalizeStyleExtensions(
      config.get<string[]>('styleExtensions', ['.css', '.scss', '.sass', '.less'])
    );
    const groupsOrder = this.normalizeGroupsOrder(
      config.get<string[]>('groupsOrder', DEFAULT_GROUP_ORDER_WITH_SEPARATORS)
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

        groups.interfaces.push(this.sortStructuredTypeMembers(interfaceResult.block, config));
        idx = interfaceResult.nextIdx;
        continue;
      }

      if (line.startsWith('type ') || line.startsWith('export type ')) {
        const typeResult = this.collectTypeBlock(lines, idx);
        if (!typeResult) {
          break;
        }

        groups.interfaces.push(this.sortStructuredTypeMembers(typeResult.block, config));
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

  private sortStructuredTypeMembers(block: string, config: SortConfig): string {
    const bodyRange = this.findTopLevelBodyRange(block);
    if (!bodyRange) {
      return block;
    }

    const header = block.slice(0, bodyRange.openBraceIdx + 1);
    const body = block.slice(bodyRange.openBraceIdx + 1, bodyRange.closeBraceIdx);
    const footer = block.slice(bodyRange.closeBraceIdx);
    const sortedMembers = this.sortStructuredMembers(body, config);

    if (!sortedMembers.length) {
      return block;
    }

    return `${header}\n${sortedMembers.join('\n')}\n${footer}`;
  }

  private sortStructuredMembers(body: string, config: SortConfig): string[] {
    const members = this.collectTopLevelMembers(body);
    const normalizedMembers = members.map((member) =>
      this.sortNestedStructuredMember(member, config)
    );

    return normalizedMembers.sort((a, b) =>
      this.compareStrings(
        this.getStructuredMemberSortValue(a, config.sortMode),
        this.getStructuredMemberSortValue(b, config.sortMode),
        config.sortMode
      )
    );
  }

  private findTopLevelBodyRange(
    block: string
  ): { openBraceIdx: number; closeBraceIdx: number } | null {
    const interfaceStart = block.match(/^\s*(?:export\s+)?interface\b/);
    const typeStart = block.match(/^\s*(?:export\s+)?type\b/);

    if (!interfaceStart && !typeStart) {
      return null;
    }

    let openBraceIdx = -1;

    if (interfaceStart) {
      openBraceIdx = block.indexOf('{');
    } else {
      const equalsIdx = block.indexOf('=');
      if (equalsIdx === -1) {
        return null;
      }

      for (let i = equalsIdx + 1; i < block.length; i++) {
        const char = block[i];
        if (/\s/.test(char)) {
          continue;
        }

        if (char !== '{') {
          return null;
        }

        openBraceIdx = i;
        break;
      }
    }

    if (openBraceIdx === -1) {
      return null;
    }

    const closeBraceIdx = this.findMatchingBraceIndex(block, openBraceIdx);
    if (closeBraceIdx === -1) {
      return null;
    }

    return { openBraceIdx, closeBraceIdx };
  }

  private findMatchingBraceIndex(text: string, openBraceIdx: number): number {
    let braceCount = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplateString = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = openBraceIdx; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      const prevChar = text[i - 1];

      if (inLineComment) {
        if (char === '\n') {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        if (prevChar === '*' && char === '/') {
          inBlockComment = false;
        }
        continue;
      }

      if (inSingleQuote) {
        if (char === "'" && prevChar !== '\\') {
          inSingleQuote = false;
        }
        continue;
      }

      if (inDoubleQuote) {
        if (char === '"' && prevChar !== '\\') {
          inDoubleQuote = false;
        }
        continue;
      }

      if (inTemplateString) {
        if (char === '`' && prevChar !== '\\') {
          inTemplateString = false;
        }
        continue;
      }

      if (char === '/' && nextChar === '/') {
        inLineComment = true;
        i++;
        continue;
      }

      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        i++;
        continue;
      }

      if (char === "'") {
        inSingleQuote = true;
        continue;
      }

      if (char === '"') {
        inDoubleQuote = true;
        continue;
      }

      if (char === '`') {
        inTemplateString = true;
        continue;
      }

      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return i;
        }
      }
    }

    return -1;
  }

  private collectTopLevelMembers(body: string): string[] {
    const members: string[] = [];
    const currentMember: string[] = [];
    let braceCount = 0;
    let parenCount = 0;
    let bracketCount = 0;

    for (const line of body.split('\n')) {
      if (!line.trim() && currentMember.length === 0) {
        continue;
      }

      currentMember.push(line);

      for (const char of line) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
        } else if (char === '(') {
          parenCount++;
        } else if (char === ')') {
          parenCount--;
        } else if (char === '[') {
          bracketCount++;
        } else if (char === ']') {
          bracketCount--;
        }
      }

      const trimmed = line.trim();
      const isTopLevel = braceCount === 0 && parenCount === 0 && bracketCount === 0;
      const isMemberTerminator = trimmed.endsWith(';') || trimmed.endsWith(',');

      if (isTopLevel && isMemberTerminator) {
        members.push(currentMember.join('\n'));
        currentMember.length = 0;
      }
    }

    if (currentMember.some((line) => line.trim())) {
      members.push(currentMember.join('\n'));
    }

    return members;
  }

  private getMemberSortKey(member: string): string {
    return member
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '';
  }

  private getStructuredMemberSortValue(
    member: string,
    mode: 'length' | 'alphabetical'
  ): string {
    if (mode === 'alphabetical') {
      return this.getMemberSortKey(member);
    }

    return member.replace(/\s+/g, ' ').trim();
  }

  private sortNestedStructuredMember(member: string, config: SortConfig): string {
    return this.sortStructuredObjectLiterals(member, config);
  }

  private sortStructuredObjectLiterals(text: string, config: SortConfig): string {
    let result = '';
    let cursor = 0;

    while (cursor < text.length) {
      const openBraceIdx = this.findNextOpenBraceIndex(text, cursor);
      if (openBraceIdx === -1) {
        result += text.slice(cursor);
        break;
      }

      const closeBraceIdx = this.findMatchingBraceIndex(text, openBraceIdx);
      if (closeBraceIdx === -1) {
        result += text.slice(cursor);
        break;
      }

      result += text.slice(cursor, openBraceIdx + 1);

      const body = text.slice(openBraceIdx + 1, closeBraceIdx);
      const normalizedBody = this.sortStructuredObjectLiterals(body, config);
      const nestedMembers = this.collectTopLevelMembers(normalizedBody);

      if (nestedMembers.length) {
        const sortedNestedMembers = this.sortStructuredMembers(normalizedBody, config);
        result += `\n${sortedNestedMembers.join('\n')}\n`;
      } else {
        result += normalizedBody;
      }

      result += text[closeBraceIdx];
      cursor = closeBraceIdx + 1;
    }

    return result;
  }

  private findNextOpenBraceIndex(text: string, startIdx: number): number {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplateString = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = startIdx; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      const prevChar = text[i - 1];

      if (inLineComment) {
        if (char === '\n') {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        if (prevChar === '*' && char === '/') {
          inBlockComment = false;
        }
        continue;
      }

      if (inSingleQuote) {
        if (char === "'" && prevChar !== '\\') {
          inSingleQuote = false;
        }
        continue;
      }

      if (inDoubleQuote) {
        if (char === '"' && prevChar !== '\\') {
          inDoubleQuote = false;
        }
        continue;
      }

      if (inTemplateString) {
        if (char === '`' && prevChar !== '\\') {
          inTemplateString = false;
        }
        continue;
      }

      if (char === '/' && nextChar === '/') {
        inLineComment = true;
        i++;
        continue;
      }

      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        i++;
        continue;
      }

      if (char === "'") {
        inSingleQuote = true;
        continue;
      }

      if (char === '"') {
        inDoubleQuote = true;
        continue;
      }

      if (char === '`') {
        inTemplateString = true;
        continue;
      }

      if (char === '{') {
        return i;
      }
    }

    return -1;
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
    const normalizedBlock = block.replace(/\s+/g, ' ').trim();
    const parsedImport = this.parseImportBlock(normalizedBlock);
    if (!parsedImport?.importClause) return block;

    const namedRange = this.findNamedImportsRange(parsedImport.importClause);
    if (!namedRange) return normalizedBlock;

    const beforeNamed = parsedImport.importClause
      .slice(0, namedRange.openBraceIdx)
      .trim()
      .replace(/,\s*$/, '');
    const afterNamed = parsedImport.importClause.slice(namedRange.closeBraceIdx + 1).trim();
    const imports = this.parseNamedImports(
      parsedImport.importClause.slice(namedRange.openBraceIdx + 1, namedRange.closeBraceIdx)
    )
      .sort((a, b) =>
        this.compareStrings(
          this.getNamedImportSortKey(a, config.sortMode),
          this.getNamedImportSortKey(b, config.sortMode),
          config.sortMode
        )
      )
      .map((specifier) => specifier.raw);

    if (!imports.length) return normalizedBlock;

    const namedImportsSingleLine = `{ ${imports.join(', ')} }`;
    const clauseParts = [beforeNamed, namedImportsSingleLine, afterNamed].filter(Boolean);
    const importKeyword = parsedImport.isTypeOnly ? 'import type' : 'import';
    const singleLineResult =
      `${importKeyword} ${clauseParts.join(', ')} from ${parsedImport.quote}${parsedImport.source}${parsedImport.quote}` +
      `${parsedImport.hasSemicolon ? ';' : ''}`;

    const formattedNamedImports =
      singleLineResult.length > config.maxLineLength
        ? `{\n${config.indent}${imports.join(`,\n${config.indent}`)},\n}`
        : namedImportsSingleLine;

    const formattedClause = [beforeNamed, formattedNamedImports, afterNamed]
      .filter(Boolean)
      .join(', ');

    return (
      `${importKeyword} ${formattedClause} from ` +
      `${parsedImport.quote}${parsedImport.source}${parsedImport.quote}` +
      `${parsedImport.hasSemicolon ? ';' : ''}`
    );
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
    const rest = lines.slice(startIdx).join('\n').trim();
    const parts: string[] = [];
    let pendingBlankLine = false;

    for (const group of config.groupsOrder) {
      if (group === '__separator__') {
        pendingBlankLine = parts.length > 0;
        continue;
      }

      const block = this.getGroupBlock(group, groups, config);
      if (block) {
        if (parts.length > 0) {
          parts.push(pendingBlankLine ? '\n\n' : '\n');
        }
        parts.push(block);
        pendingBlankLine = false;
      }
    }

    if (rest) {
      if (parts.length > 0) {
        parts.push(pendingBlankLine ? '\n\n' : '\n');
      }
      parts.push(rest);
    }

    return parts.join('').replace(/\n{3,}/g, '\n\n').trim() + '\n';
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

  private parseImportBlock(block: string): ParsedImportBlock | null {
    const sideEffectMatch = block.match(/^import\s+['"]([^'"]+)['"]\s*;?$/);
    if (sideEffectMatch) {
      return {
        source: sideEffectMatch[1],
        quote: block.includes('"') ? '"' : "'",
        importClause: null,
        isTypeOnly: false,
        hasSemicolon: /;\s*$/.test(block),
      };
    }

    const match = block.match(/^import\s+(type\s+)?(.+?)\s+from\s+(['"])([^'"]+)\3\s*(;)?$/);
    if (!match) {
      return null;
    }

    return {
      source: match[4],
      quote: match[3],
      importClause: match[2].trim(),
      isTypeOnly: Boolean(match[1]),
      hasSemicolon: Boolean(match[5]),
    };
  }

  private findNamedImportsRange(
    importClause: string
  ): { openBraceIdx: number; closeBraceIdx: number } | null {
    const openBraceIdx = importClause.indexOf('{');
    if (openBraceIdx === -1) {
      return null;
    }

    const closeBraceIdx = this.findMatchingBraceIndex(importClause, openBraceIdx);
    if (closeBraceIdx === -1) {
      return null;
    }

    return { openBraceIdx, closeBraceIdx };
  }

  private parseNamedImports(specifiersBlock: string): Array<{ raw: string; sortKey: string }> {
    return specifiersBlock
      .split(',')
      .map((specifier) => specifier.trim())
      .filter(Boolean)
      .map((specifier) => ({
        raw: specifier,
        sortKey: specifier.replace(/^type\s+/i, '').trim(),
      }));
  }

  private getNamedImportSortKey(
    specifier: { raw: string; sortKey: string },
    mode: 'length' | 'alphabetical'
  ): string {
    if (mode === 'alphabetical') {
      return specifier.sortKey;
    }

    return specifier.raw;
  }

  private compareImportStatements(
    a: string,
    b: string,
    mode: 'length' | 'alphabetical'
  ): number {
    const parsedA = this.parseImportBlock(a.replace(/\s+/g, ' ').trim());
    const parsedB = this.parseImportBlock(b.replace(/\s+/g, ' ').trim());

    if (!parsedA || !parsedB) {
      return this.compareStrings(a, b, mode);
    }

    if (mode === 'alphabetical') {
      return (
        parsedA.source.localeCompare(parsedB.source, undefined, { sensitivity: 'base' }) ||
        this.getTypeImportRank(parsedA.isTypeOnly) - this.getTypeImportRank(parsedB.isTypeOnly) ||
        this.compareImportClausesAlphabetically(parsedA.importClause, parsedB.importClause)
      );
    }

    return this.compareStrings(a, b, mode);
  }

  private compareImportClausesAlphabetically(
    a: string | null,
    b: string | null
  ): number {
    const rankA = this.getImportClauseRank(a);
    const rankB = this.getImportClauseRank(b);

    return (
      rankA - rankB ||
      (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base' })
    );
  }

  private getTypeImportRank(isTypeOnly: boolean): number {
    return isTypeOnly ? 0 : 1;
  }

  private getImportClauseRank(importClause: string | null): number {
    if (!importClause) {
      return 3;
    }

    const trimmed = importClause.trim();
    if (!trimmed) {
      return 3;
    }

    if (trimmed.includes('{')) {
      return trimmed.startsWith('{') ? 1 : 0;
    }

    return 0;
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

  private normalizeGroupsOrder(groupsOrder: string[]): GroupOrderItem[] {
    const valid = new Set<GroupKey>(DEFAULT_GROUP_ORDER);
    const result: GroupOrderItem[] = [];
    const usedGroups = new Set<GroupKey>();

    for (const group of groupsOrder) {
      const trimmed = group.trim();

      if (trimmed === 'spacing') {
        if (result.length > 0 && result[result.length - 1] !== '__separator__') {
          result.push('__separator__');
        }
        continue;
      }

      if (valid.has(trimmed as GroupKey) && !usedGroups.has(trimmed as GroupKey)) {
        result.push(trimmed as GroupKey);
        usedGroups.add(trimmed as GroupKey);
      }
    }

    for (const defaultGroup of DEFAULT_GROUP_ORDER) {
      if (!usedGroups.has(defaultGroup)) {
        result.push(defaultGroup);
      }
    }

    while (result[result.length - 1] === '__separator__') {
      result.pop();
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
      config.sortMode === 'alphabetical'
        ? this.compareImportStatements(a, b, config.sortMode)
        : this.compareStrings(a, b, config.sortMode);
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

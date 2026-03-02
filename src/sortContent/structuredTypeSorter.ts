import { SortConfig } from './types';
import { compareStrings } from './importFormatting';

export class StructuredTypeSorter {
  public sort(block: string, config: SortConfig): string {
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

  public findMatchingBraceIndex(text: string, openBraceIdx: number): number {
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

  private sortStructuredMembers(body: string, config: SortConfig): string[] {
    const members = this.collectTopLevelMembers(body);
    const normalizedMembers = members.map((member) =>
      this.sortStructuredObjectLiterals(member, config)
    );

    return normalizedMembers.sort((a, b) =>
      compareStrings(
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

  private getStructuredMemberSortValue(
    member: string,
    mode: 'length' | 'alphabetical'
  ): string {
    if (mode === 'alphabetical') {
      return this.getMemberSortKey(member);
    }

    return member.replace(/\s+/g, ' ').trim();
  }

  private getMemberSortKey(member: string): string {
    return member
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '';
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
}

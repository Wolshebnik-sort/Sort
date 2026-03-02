import { getStylePropertyOrder } from './propertyOrder';
import { DeclarationNode, StyleGroupKey, StyleNode } from './types';

export function parseTopLevelNodes(
  body: string,
  styleGroupsOrder: StyleGroupKey[]
): StyleNode[] {
  const nodes: StyleNode[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    cursor = skipWhitespace(body, cursor);
    if (cursor >= body.length) {
      break;
    }

    if (startsWithBlockComment(body, cursor)) {
      const endIdx = body.indexOf('*/', cursor + 2);
      const commentEnd = endIdx === -1 ? body.length : endIdx + 2;
      nodes.push({ type: 'comment', text: body.slice(cursor, commentEnd).trim() });
      cursor = commentEnd;
      continue;
    }

    if (startsWithLineComment(body, cursor)) {
      const lineEnd = body.indexOf('\n', cursor);
      const commentEnd = lineEnd === -1 ? body.length : lineEnd;
      nodes.push({ type: 'comment', text: body.slice(cursor, commentEnd).trim() });
      cursor = commentEnd;
      continue;
    }

    const nextDelimiter = findNextTopLevelDelimiter(body, cursor);
    if (!nextDelimiter) {
      const tail = body.slice(cursor).trim();
      if (tail) {
        nodes.push(createStatementNode(tail, styleGroupsOrder));
      }
      break;
    }

    if (nextDelimiter.type === 'brace') {
      const header = body.slice(cursor, nextDelimiter.index).trim();
      const closeBraceIdx = findMatchingBraceIndex(body, nextDelimiter.index);
      if (closeBraceIdx === -1) {
        const tail = body.slice(cursor).trim();
        if (tail) {
          nodes.push(createStatementNode(tail, styleGroupsOrder));
        }
        break;
      }

      let nextCursor = closeBraceIdx + 1;
      let trailingSemicolon = false;
      if (body[nextCursor] === ';') {
        trailingSemicolon = true;
        nextCursor++;
      }

      nodes.push({
        type: 'block',
        header,
        body: body.slice(nextDelimiter.index + 1, closeBraceIdx),
        trailingSemicolon,
      });
      cursor = nextCursor;
      continue;
    }

    const statement = body.slice(cursor, nextDelimiter.index + 1).trim();
    if (statement) {
      nodes.push(createStatementNode(statement, styleGroupsOrder));
    }
    cursor = nextDelimiter.index + 1;
  }

  return nodes;
}

export function findNextOpenBraceIndex(text: string, startIdx: number): number {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let interpolationDepth = 0;

  for (let index = startIdx; index < text.length; index++) {
    const char = text[index];
    const nextChar = text[index + 1];
    const prevChar = text[index - 1];

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

    if (char === '#' && nextChar === '{') {
      interpolationDepth++;
      index++;
      continue;
    }

    if (interpolationDepth > 0) {
      if (char === '{') {
        interpolationDepth++;
      } else if (char === '}') {
        interpolationDepth--;
      }
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index++;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index++;
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
      return index;
    }
  }

  return -1;
}

export function findMatchingBraceIndex(text: string, openBraceIdx: number): number {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let interpolationDepth = 0;

  for (let index = openBraceIdx; index < text.length; index++) {
    const char = text[index];
    const nextChar = text[index + 1];
    const prevChar = text[index - 1];

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

    if (char === '#' && nextChar === '{') {
      interpolationDepth++;
      index++;
      continue;
    }

    if (interpolationDepth > 0) {
      if (char === '{') {
        interpolationDepth++;
      } else if (char === '}') {
        interpolationDepth--;
      }
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index++;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index++;
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
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

export function getIndentAtIndex(text: string, index: number): string {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const linePrefix = text.slice(lineStart, index);
  const indentMatch = linePrefix.match(/^\s*/);

  return indentMatch?.[0] ?? '';
}

function createStatementNode(text: string, styleGroupsOrder: StyleGroupKey[]): StyleNode {
  const property = getDeclarationProperty(text);
  if (!property) {
    return { type: 'statement', text };
  }

  const order = getStylePropertyOrder(property, styleGroupsOrder);

  return {
    type: 'declaration',
    text,
    property,
    groupRank: order.groupRank,
    propertyRank: order.propertyRank,
  };
}

function getDeclarationProperty(text: string): string | null {
  const normalized = text.trim();
  if (!normalized.endsWith(';') || normalized.startsWith('@')) {
    return null;
  }

  const propertyMatch = normalized.match(/^([A-Za-z_-][A-Za-z0-9_-]*|--[A-Za-z0-9_-]+)\s*:/);
  return propertyMatch ? propertyMatch[1].toLowerCase() : null;
}

function findNextTopLevelDelimiter(
  text: string,
  startIdx: number
): { type: 'brace' | 'semicolon'; index: number } | null {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let interpolationDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let index = startIdx; index < text.length; index++) {
    const char = text[index];
    const nextChar = text[index + 1];
    const prevChar = text[index - 1];

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

    if (char === '#' && nextChar === '{') {
      interpolationDepth++;
      index++;
      continue;
    }

    if (interpolationDepth > 0) {
      if (char === '{') {
        interpolationDepth++;
      } else if (char === '}') {
        interpolationDepth--;
      }
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index++;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index++;
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

    if (char === '(') {
      parenDepth++;
      continue;
    }

    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (char === '[') {
      bracketDepth++;
      continue;
    }

    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }

    if (parenDepth > 0 || bracketDepth > 0) {
      continue;
    }

    if (char === '{') {
      return { type: 'brace', index };
    }

    if (char === ';') {
      return { type: 'semicolon', index };
    }
  }

  return null;
}

function skipWhitespace(text: string, startIdx: number): number {
  let index = startIdx;

  while (index < text.length && /\s/.test(text[index])) {
    index++;
  }

  return index;
}

function startsWithBlockComment(text: string, index: number): boolean {
  return text[index] === '/' && text[index + 1] === '*';
}

function startsWithLineComment(text: string, index: number): boolean {
  return text[index] === '/' && text[index + 1] === '/';
}

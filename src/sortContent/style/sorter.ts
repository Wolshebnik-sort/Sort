import { DEFAULT_STYLE_GROUP_ORDER } from '../defaults';
import { renderComment, indentMultilineText, renderStyleParts } from './formatter';
import {
  findMatchingBraceIndex,
  findNextOpenBraceIndex,
  getIndentAtIndex,
  parseTopLevelNodes,
} from './parser';
import { DeclarationNode, StyleGroupKey, StyleNode } from './types';

type SortStyleOptions = {
  indent?: string;
  groupsOrder?: StyleGroupKey[];
};

export function sortStyleContent(content: string, options: SortStyleOptions | string = '  '): string {
  const normalizedOptions =
    typeof options === 'string'
      ? { indent: options, groupsOrder: DEFAULT_STYLE_GROUP_ORDER }
      : {
          indent: options.indent ?? '  ',
          groupsOrder: options.groupsOrder ?? DEFAULT_STYLE_GROUP_ORDER,
        };

  return sortStyleSegment(content, '', normalizedOptions.indent, normalizedOptions.groupsOrder);
}

function sortStyleSegment(
  content: string,
  parentIndent: string,
  indentUnit: string,
  groupsOrder: StyleGroupKey[]
): string {
  let result = '';
  let cursor = 0;

  while (cursor < content.length) {
    const openBraceIdx = findNextOpenBraceIndex(content, cursor);
    if (openBraceIdx === -1) {
      result += content.slice(cursor);
      break;
    }

    const closeBraceIdx = findMatchingBraceIndex(content, openBraceIdx);
    if (closeBraceIdx === -1) {
      result += content.slice(cursor);
      break;
    }

    result += content.slice(cursor, openBraceIdx + 1);
    const body = content.slice(openBraceIdx + 1, closeBraceIdx);
    const blockIndent = getIndentAtIndex(content, openBraceIdx) || parentIndent;
    result += sortStyleBlockBody(body, blockIndent, indentUnit, groupsOrder);
    result += `${blockIndent}${content[closeBraceIdx]}`;
    cursor = closeBraceIdx + 1;
  }

  return result;
}

function sortStyleBlockBody(
  body: string,
  parentIndent: string,
  indentUnit: string,
  groupsOrder: StyleGroupKey[]
): string {
  const childIndent = `${parentIndent}${indentUnit}`;
  const nodes = parseTopLevelNodes(body, groupsOrder).map((node) =>
    node.type === 'block'
      ? {
          ...node,
          body: sortStyleBlockBody(node.body, childIndent, indentUnit, groupsOrder),
        }
      : node
  );

  if (!nodes.length) {
    return body.trim() ? body : '';
  }

  const parts: Array<{ type: 'chunk' | 'comment'; value: string }> = [];
  let chunk: StyleNode[] = [];

  const flushChunk = () => {
    if (!chunk.length) {
      return;
    }

    const renderedChunk = renderStyleParts(
      chunk,
      childIndent,
      renderNode,
      compareDeclarations
    );
    if (renderedChunk) {
      parts.push({ type: 'chunk', value: renderedChunk });
    }
    chunk = [];
  };

  for (const node of nodes) {
    if (node.type === 'comment') {
      flushChunk();
      parts.push({ type: 'comment', value: renderComment(node.text, childIndent) });
      continue;
    }

    chunk.push(node);
  }

  flushChunk();

  if (!parts.length) {
    return '';
  }

  const rendered = parts.reduce((acc, part, index) => {
    if (index === 0) {
      return part.value;
    }

    const previous = parts[index - 1];
    const separator =
      previous?.type === 'comment' || part.type === 'comment' ? '\n' : '\n\n';

    return `${acc}${separator}${part.value}`;
  }, '');

  return `\n${rendered}\n`;
}

function renderNode(node: Exclude<StyleNode, DeclarationNode>, indent: string): string {
  switch (node.type) {
    case 'block':
      return `${indent}${node.header.trim()} {${node.body}${indent}}${
        node.trailingSemicolon ? ';' : ''
      }`;
    case 'statement':
      return indentMultilineText(node.text, indent);
    case 'comment':
      return renderComment(node.text, indent);
    default:
      return '';
  }
}

function compareDeclarations(a: DeclarationNode, b: DeclarationNode): number {
  return (
    a.groupRank - b.groupRank ||
    a.propertyRank - b.propertyRank ||
    a.property.localeCompare(b.property, undefined, { sensitivity: 'base' }) ||
    a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })
  );
}

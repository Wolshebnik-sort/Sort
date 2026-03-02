import { DeclarationNode, StyleNode } from './types';

export function renderStyleParts(
  nodes: StyleNode[],
  indent: string,
  renderNode: (node: Exclude<StyleNode, DeclarationNode>, indent: string) => string,
  compareDeclarations: (a: DeclarationNode, b: DeclarationNode) => number
): string {
  const declarations = nodes
    .filter((node): node is DeclarationNode => node.type === 'declaration')
    .sort(compareDeclarations);
  const others = nodes.filter(
    (node): node is Exclude<StyleNode, DeclarationNode> => node.type !== 'declaration'
  );
  const parts: string[] = [];

  if (declarations.length) {
    parts.push(renderDeclarations(declarations, indent));
  }

  if (others.length) {
    parts.push(
      others
        .map((node) => renderNode(node, indent))
        .filter(Boolean)
        .join('\n\n')
    );
  }

  return parts.filter(Boolean).join('\n\n');
}

export function renderDeclarations(
  declarations: DeclarationNode[],
  indent: string
): string {
  const lines: string[] = [];
  let previousGroupRank: number | null = null;

  for (const declaration of declarations) {
    if (previousGroupRank !== null && declaration.groupRank !== previousGroupRank) {
      lines.push('');
    }

    lines.push(indentMultilineText(declaration.text, indent));
    previousGroupRank = declaration.groupRank;
  }

  return lines.join('\n');
}

export function renderComment(text: string, indent: string): string {
  return indentMultilineText(text, indent);
}

export function indentMultilineText(text: string, indent: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => `${indent}${line.trimEnd()}`)
    .join('\n');
}

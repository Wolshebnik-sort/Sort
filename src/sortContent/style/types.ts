export type StyleGroupKey =
  | 'customProperties'
  | 'position'
  | 'size'
  | 'spacing'
  | 'layout'
  | 'overflow'
  | 'typography'
  | 'visual'
  | 'effects'
  | 'interaction';

export interface DeclarationNode {
  type: 'declaration';
  text: string;
  property: string;
  groupRank: number;
  propertyRank: number;
}

export interface BlockNode {
  type: 'block';
  header: string;
  body: string;
  trailingSemicolon: boolean;
}

export interface CommentNode {
  type: 'comment';
  text: string;
}

export interface StatementNode {
  type: 'statement';
  text: string;
}

export type StyleNode = DeclarationNode | BlockNode | CommentNode | StatementNode;

import type { StyleGroupKey } from './style/types';

export interface ImportGroups {
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

export type GroupKey =
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

export type ImportGroupKey =
  | 'react'
  | 'libraries'
  | 'absolute'
  | 'relative'
  | 'sideEffect'
  | 'styles';

export type GroupOrderItem = GroupKey | '__separator__';

export interface SortConfig {
  maxLineLength: number;
  indent: string;
  aliasPrefixes: string[];
  detectAliasesFromProjectConfig: boolean;
  enableStyleSorting: boolean;
  sortMode: 'length' | 'alphabetical';
  mergeDuplicateImports: boolean;
  styleExtensions: string[];
  styleGroupsOrder: StyleGroupKey[];
  groupsOrder: GroupOrderItem[];
}

export interface ParsedImportBlock {
  source: string;
  quote: string;
  importClause: string | null;
  isTypeOnly: boolean;
  hasSemicolon: boolean;
}

export interface BlockCollectionResult {
  block: string;
  nextIdx: number;
}

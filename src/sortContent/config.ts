import * as vscode from 'vscode';

import {
  DEFAULT_ALIAS_PREFIXES,
  DEFAULT_GROUP_ORDER,
  DEFAULT_GROUP_ORDER_WITH_SEPARATORS,
  DEFAULT_STYLE_EXTENSIONS,
  DEFAULT_STYLE_GROUP_ORDER,
} from './defaults';
import { resolveAliasPrefixes } from './projectAliasResolver';
import { GroupKey, SortConfig, GroupOrderItem } from './types';
import { StyleGroupKey } from './style/types';

export function getSortConfig(documentUri?: vscode.Uri): SortConfig {
  const config = vscode.workspace.getConfiguration('sortImports', documentUri);
  const styleExtensions = normalizeStyleExtensions(
    config.get<string[]>('styleExtensions', DEFAULT_STYLE_EXTENSIONS),
  );
  const groupsOrder = normalizeGroupsOrder(
    config.get<string[]>('groupsOrder', DEFAULT_GROUP_ORDER_WITH_SEPARATORS),
  );
  const styleGroupsOrder = normalizeStyleGroupsOrder(
    config.get<string[]>('styleGroupsOrder', DEFAULT_STYLE_GROUP_ORDER),
  );
  const detectAliasesFromProjectConfig = config.get<boolean>(
    'detectAliasesFromProjectConfig',
    false,
  );
  const manualAliasPrefixes = config.get<string[]>('aliasPrefixes', [
    ...DEFAULT_ALIAS_PREFIXES,
  ]);

  return {
    maxLineLength: config.get<number>('maxLineLength', 100),
    indent: config.get<string>('indentSize', '  '),
    aliasPrefixes: resolveAliasPrefixes(
      documentUri,
      manualAliasPrefixes,
      detectAliasesFromProjectConfig,
    ),
    detectAliasesFromProjectConfig,
    enableStyleSorting: config.get<boolean>('enableStyleSorting', false),
    sortMode: config.get<'length' | 'alphabetical'>('sortMode', 'length'),
    mergeDuplicateImports: config.get<boolean>('mergeDuplicateImports', false),
    styleExtensions,
    styleGroupsOrder,
    groupsOrder,
  };
}

function normalizeStyleExtensions(extensions: string[]): string[] {
  const normalized = new Set<string>();

  for (const ext of extensions) {
    const trimmed = ext.trim().toLowerCase();
    if (!trimmed) {
      continue;
    }
    normalized.add(trimmed.startsWith('.') ? trimmed : `.${trimmed}`);
  }

  if (normalized.size === 0) {
    return [...DEFAULT_STYLE_EXTENSIONS];
  }

  return [...normalized];
}

function normalizeGroupsOrder(groupsOrder: string[]): GroupOrderItem[] {
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

    if (
      valid.has(trimmed as GroupKey) &&
      !usedGroups.has(trimmed as GroupKey)
    ) {
      result.push(trimmed as GroupKey);
      usedGroups.add(trimmed as GroupKey);
    }
  }

  while (result[result.length - 1] === '__separator__') {
    result.pop();
  }

  return result;
}

function normalizeStyleGroupsOrder(groupsOrder: string[]): StyleGroupKey[] {
  const valid = new Set<StyleGroupKey>(DEFAULT_STYLE_GROUP_ORDER);
  const result: StyleGroupKey[] = [];

  for (const group of groupsOrder) {
    const trimmed = group.trim() as StyleGroupKey;

    if (valid.has(trimmed) && !result.includes(trimmed)) {
      result.push(trimmed);
    }
  }

  for (const group of DEFAULT_STYLE_GROUP_ORDER) {
    if (!result.includes(group)) {
      result.push(group);
    }
  }

  return result;
}

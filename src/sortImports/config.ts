import * as vscode from 'vscode';

import {
  DEFAULT_GROUP_ORDER,
  DEFAULT_GROUP_ORDER_WITH_SEPARATORS,
  GroupKey,
  GroupOrderItem,
  SortConfig,
} from './types';

export function getSortConfig(): SortConfig {
  const config = vscode.workspace.getConfiguration('sortImports');
  const styleExtensions = normalizeStyleExtensions(
    config.get<string[]>('styleExtensions', ['.css', '.scss', '.sass', '.less'])
  );
  const groupsOrder = normalizeGroupsOrder(
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
    return ['.css', '.scss', '.sass', '.less'];
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

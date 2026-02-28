import { ImportGroupKey, ImportGroups, ParsedImportBlock, SortConfig } from './types';
import { StructuredTypeSorter } from './structuredTypeSorter';

const structuredTypeSorter = new StructuredTypeSorter();

interface ParsedImportClause {
  defaultImport: string | null;
  namespaceImport: string | null;
  namedSpecifiers: string[];
  mergeable: boolean;
}

interface MergedImportEntry {
  source: string;
  quote: string;
  isTypeOnly: boolean;
  hasSemicolon: boolean;
  clause: ParsedImportClause | null;
}

export function compareStrings(
  a: string,
  b: string,
  mode: 'length' | 'alphabetical'
): number {
  if (mode === 'alphabetical') {
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  }

  return a.length - b.length || a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function sortTypeMembers(block: string, config: SortConfig): string {
  return structuredTypeSorter.sort(block, config);
}

export function getImportGroup(block: string, config: SortConfig): ImportGroupKey | null {
  const normalizedBlock = block.replace(/\s+/g, ' ').trim();
  const source = getImportSource(normalizedBlock);
  if (!source) {
    return null;
  }

  if (isSideEffectImport(normalizedBlock)) {
    return isStyleImport(source, config.styleExtensions) ? 'styles' : 'sideEffect';
  }

  if (isStyleImport(source, config.styleExtensions)) {
    return 'styles';
  } else if (source === 'react' || source.startsWith('react/')) {
    return 'react';
  } else if (isAliasImport(source, config.aliasPrefixes)) {
    return 'absolute';
  } else if (source.startsWith('.') || source.startsWith('/')) {
    return 'relative';
  } else if (isExternalLib(source, config.aliasPrefixes)) {
    return 'libraries';
  } else {
    return 'absolute';
  }
}

export function formatImportBlock(block: string, config: SortConfig): string {
  const normalizedBlock = block.replace(/\s+/g, ' ').trim();
  const parsedImport = parseImportBlock(normalizedBlock);
  if (!parsedImport?.importClause) return block;

  const namedRange = findNamedImportsRange(parsedImport.importClause, structuredTypeSorter);
  if (!namedRange) return normalizedBlock;

  const beforeNamed = parsedImport.importClause
    .slice(0, namedRange.openBraceIdx)
    .trim()
    .replace(/,\s*$/, '');
  const afterNamed = parsedImport.importClause.slice(namedRange.closeBraceIdx + 1).trim();
  const imports = parseNamedImports(
    parsedImport.importClause.slice(namedRange.openBraceIdx + 1, namedRange.closeBraceIdx)
  )
    .sort((a, b) =>
      compareStrings(
        getNamedImportSortKey(a, config.sortMode),
        getNamedImportSortKey(b, config.sortMode),
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

export function compareImportStatements(
  a: string,
  b: string,
  mode: 'length' | 'alphabetical'
): number {
  const parsedA = parseImportBlock(a.replace(/\s+/g, ' ').trim());
  const parsedB = parseImportBlock(b.replace(/\s+/g, ' ').trim());

  if (!parsedA || !parsedB) {
    return compareStrings(a, b, mode);
  }

  if (mode === 'alphabetical') {
    return (
      parsedA.source.localeCompare(parsedB.source, undefined, { sensitivity: 'base' }) ||
      getTypeImportRank(parsedA.isTypeOnly) - getTypeImportRank(parsedB.isTypeOnly) ||
      compareImportClausesAlphabetically(parsedA.importClause, parsedB.importClause)
    );
  }

  return compareStrings(a, b, mode);
}

export function mergeImportStatements(blocks: string[], config: SortConfig): string[] {
  const mergedEntries: MergedImportEntry[] = [];
  const passthroughBlocks: string[] = [];

  for (const block of blocks) {
    const normalizedBlock = block.replace(/\s+/g, ' ').trim();
    const parsedImport = parseImportBlock(normalizedBlock);

    if (!parsedImport) {
      passthroughBlocks.push(block);
      continue;
    }

    if (!parsedImport.importClause) {
      if (!mergedEntries.some((entry) => entry.source === parsedImport.source && entry.clause === null)) {
        mergedEntries.push({
          source: parsedImport.source,
          quote: parsedImport.quote,
          isTypeOnly: parsedImport.isTypeOnly,
          hasSemicolon: parsedImport.hasSemicolon,
          clause: null,
        });
      }
      continue;
    }

    const parsedClause = parseImportClause(parsedImport.importClause);
    if (!parsedClause.mergeable) {
      passthroughBlocks.push(formatImportBlock(block, config));
      continue;
    }

    const mergeTarget = mergedEntries.find(
      (entry) =>
        entry.source === parsedImport.source &&
        entry.isTypeOnly === parsedImport.isTypeOnly &&
        entry.clause !== null &&
        canMergeImportClauses(entry.clause, parsedClause)
    );

    if (!mergeTarget) {
      mergedEntries.push({
        source: parsedImport.source,
        quote: parsedImport.quote,
        isTypeOnly: parsedImport.isTypeOnly,
        hasSemicolon: parsedImport.hasSemicolon,
        clause: {
          defaultImport: parsedClause.defaultImport,
          namespaceImport: parsedClause.namespaceImport,
          namedSpecifiers: [...parsedClause.namedSpecifiers],
          mergeable: true,
        },
      });
      continue;
    }

    mergeTarget.hasSemicolon = mergeTarget.hasSemicolon || parsedImport.hasSemicolon;
    const existingClause = mergeTarget.clause;
    if (!existingClause) {
      passthroughBlocks.push(formatImportBlock(block, config));
      continue;
    }

    mergeTarget.clause = mergeParsedImportClauses(existingClause, parsedClause);
  }

  return [
    ...mergedEntries.map((entry) => formatMergedImportEntry(entry, config)),
    ...passthroughBlocks,
  ];
}

export function parseImportBlock(block: string): ParsedImportBlock | null {
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

function getImportSource(block: string): string | null {
  const sideEffectMatch = block.match(/^import\s+['"]([^'"]+)['"]\s*;?$/);
  if (sideEffectMatch) {
    return sideEffectMatch[1];
  }

  const sourceMatch = block.match(/\bfrom\s+['"]([^'"]+)['"]\s*;?$/);
  return sourceMatch?.[1] ?? null;
}

function isSideEffectImport(block: string): boolean {
  return /^import\s+['"]([^'"]+)['"]\s*;?$/.test(block);
}

function isExternalLib(source: string, aliasPrefixes: string[]): boolean {
  return !source.startsWith('.') && !source.startsWith('/') && !isAliasImport(source, aliasPrefixes);
}

function isAliasImport(source: string, aliasPrefixes: string[]): boolean {
  return aliasPrefixes.some((prefix) => {
    const trimmed = prefix.trim();
    if (!trimmed) return false;

    if (trimmed.endsWith('/')) {
      return source.startsWith(trimmed);
    }

    return source === trimmed || source.startsWith(`${trimmed}/`);
  });
}

function isStyleImport(source: string, styleExtensions: string[]): boolean {
  const normalized = source.toLowerCase();
  return styleExtensions.some((ext) => normalized.endsWith(ext));
}

function findNamedImportsRange(
  importClause: string,
  braceMatcher: StructuredTypeSorter
): { openBraceIdx: number; closeBraceIdx: number } | null {
  const openBraceIdx = importClause.indexOf('{');
  if (openBraceIdx === -1) {
    return null;
  }

  const closeBraceIdx = braceMatcher.findMatchingBraceIndex(importClause, openBraceIdx);
  if (closeBraceIdx === -1) {
    return null;
  }

  return { openBraceIdx, closeBraceIdx };
}

function parseImportClause(importClause: string): ParsedImportClause {
  const trimmedClause = importClause.trim();
  const namedRange = findNamedImportsRange(trimmedClause, structuredTypeSorter);

  if (namedRange) {
    const beforeNamed = trimmedClause
      .slice(0, namedRange.openBraceIdx)
      .trim()
      .replace(/,\s*$/, '');
    const afterNamed = trimmedClause.slice(namedRange.closeBraceIdx + 1).trim();
    const namedSpecifiers = parseNamedImports(
      trimmedClause.slice(namedRange.openBraceIdx + 1, namedRange.closeBraceIdx)
    ).map((specifier) => specifier.raw);

    return {
      defaultImport: beforeNamed || null,
      namespaceImport: null,
      namedSpecifiers,
      mergeable: !afterNamed,
    };
  }

  const segments = splitTopLevelImportClause(trimmedClause);
  if (segments.length === 0 || segments.length > 2) {
    return {
      defaultImport: null,
      namespaceImport: null,
      namedSpecifiers: [],
      mergeable: false,
    };
  }

  let defaultImport: string | null = null;
  let namespaceImport: string | null = null;

  for (const segment of segments) {
    if (segment.startsWith('* as ')) {
      if (namespaceImport) {
        return {
          defaultImport: null,
          namespaceImport: null,
          namedSpecifiers: [],
          mergeable: false,
        };
      }
      namespaceImport = segment;
      continue;
    }

    if (defaultImport) {
      return {
        defaultImport: null,
        namespaceImport: null,
        namedSpecifiers: [],
        mergeable: false,
      };
    }

    defaultImport = segment;
  }

  return {
    defaultImport,
    namespaceImport,
    namedSpecifiers: [],
    mergeable: true,
  };
}

function parseNamedImports(specifiersBlock: string): Array<{ raw: string; sortKey: string }> {
  return specifiersBlock
    .split(',')
    .map((specifier) => specifier.trim())
    .filter(Boolean)
    .map((specifier) => ({
      raw: specifier,
      sortKey: specifier.replace(/^type\s+/i, '').trim(),
    }));
}

function getNamedImportSortKey(
  specifier: { raw: string; sortKey: string },
  mode: 'length' | 'alphabetical'
): string {
  if (mode === 'alphabetical') {
    return specifier.sortKey;
  }

  return specifier.raw;
}

function compareImportClausesAlphabetically(a: string | null, b: string | null): number {
  const rankA = getImportClauseRank(a);
  const rankB = getImportClauseRank(b);

  return rankA - rankB || (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base' });
}

function getTypeImportRank(isTypeOnly: boolean): number {
  return isTypeOnly ? 0 : 1;
}

function getImportClauseRank(importClause: string | null): number {
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

function splitTopLevelImportClause(importClause: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let braceCount = 0;

  for (let i = 0; i < importClause.length; i++) {
    const char = importClause[i];

    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
    } else if (char === ',' && braceCount === 0) {
      const part = importClause.slice(start, i).trim();
      if (part) {
        segments.push(part);
      }
      start = i + 1;
    }
  }

  const tail = importClause.slice(start).trim();
  if (tail) {
    segments.push(tail);
  }

  return segments;
}

function canMergeImportClauses(
  existingClause: ParsedImportClause,
  incomingClause: ParsedImportClause
): boolean {
  const hasConflictingDefault =
    existingClause.defaultImport &&
    incomingClause.defaultImport &&
    existingClause.defaultImport !== incomingClause.defaultImport;
  if (hasConflictingDefault) {
    return false;
  }

  const hasConflictingNamespace =
    existingClause.namespaceImport &&
    incomingClause.namespaceImport &&
    existingClause.namespaceImport !== incomingClause.namespaceImport;
  if (hasConflictingNamespace) {
    return false;
  }

  const combinesNamespaceWithNamed =
    (existingClause.namespaceImport && incomingClause.namedSpecifiers.length > 0) ||
    (incomingClause.namespaceImport && existingClause.namedSpecifiers.length > 0);

  return !combinesNamespaceWithNamed;
}

function mergeParsedImportClauses(
  existingClause: ParsedImportClause,
  incomingClause: ParsedImportClause
): ParsedImportClause {
  return {
    defaultImport: existingClause.defaultImport ?? incomingClause.defaultImport,
    namespaceImport: existingClause.namespaceImport ?? incomingClause.namespaceImport,
    namedSpecifiers: dedupeNamedSpecifiers([
      ...existingClause.namedSpecifiers,
      ...incomingClause.namedSpecifiers,
    ]),
    mergeable: true,
  };
}

function dedupeNamedSpecifiers(specifiers: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const specifier of specifiers) {
    const normalizedSpecifier = specifier.trim();
    if (!normalizedSpecifier || seen.has(normalizedSpecifier)) {
      continue;
    }

    seen.add(normalizedSpecifier);
    result.push(normalizedSpecifier);
  }

  return result;
}

function formatMergedImportEntry(entry: MergedImportEntry, config: SortConfig): string {
  if (!entry.clause) {
    return `import ${entry.quote}${entry.source}${entry.quote}${entry.hasSemicolon ? ';' : ''}`;
  }

  const clauseParts: string[] = [];

  if (entry.clause.defaultImport) {
    clauseParts.push(entry.clause.defaultImport);
  }

  if (entry.clause.namespaceImport) {
    clauseParts.push(entry.clause.namespaceImport);
  } else if (entry.clause.namedSpecifiers.length) {
    clauseParts.push(`{ ${entry.clause.namedSpecifiers.join(', ')} }`);
  }

  const importKeyword = entry.isTypeOnly ? 'import type' : 'import';
  return formatImportBlock(
    `${importKeyword} ${clauseParts.join(', ')} from ${entry.quote}${entry.source}${entry.quote}${
      entry.hasSemicolon ? ';' : ''
    }`,
    config
  );
}

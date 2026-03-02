import { GroupKey, SortConfig, ImportGroups, GroupOrderItem } from './types';
import {
  collectTypeBlock,
  collectBraceBlock,
  collectImportBlock,
  isFunctionLikeStart,
  collectFunctionBlock,
} from './blockCollectors';
import {
  compareStrings,
  getImportGroup,
  sortTypeMembers,
  formatImportBlock,
  mergeImportStatements,
  compareImportStatements,
} from './importFormatting';

type RawSectionPart = {
 type: 'raw'; value: string
};
type CommentSectionPart = {
 type: 'comment'; value: string
};
type ConfiguredSectionPart = {
 type: 'configured'; groups: ImportGroups
};
type SectionPart = RawSectionPart | CommentSectionPart | ConfiguredSectionPart;

export function sortContent(content: string, config: SortConfig): string {
  const lines = content.split(/\r?\n/);
  const configuredGroups = getConfiguredGroups(config.groupsOrder);
  const sectionParts: SectionPart[] = [];
  let currentConfiguredPart: ConfiguredSectionPart | null = null;
  let idx = 0;

  while (lines[idx]?.trim() === '') {
    idx++;
  }

  while (idx < lines.length) {
    const line = lines[idx].trim();

    if (!line) {
      idx++;
      continue;
    }

    const directive = line.match(/^['"](use (?:client|server))['"]\.?;?$/i);
    if (directive) {
      currentConfiguredPart = pushSectionEntry(
        sectionParts,
        currentConfiguredPart,
        configuredGroups,
        'directives',
        `'${directive[1]}';`
      );
      idx++;
      continue;
    }

    if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
      if (currentConfiguredPart) {
        sectionParts.push(currentConfiguredPart);
        currentConfiguredPart = null;
      }

      sectionParts.push({ type: 'comment', value: lines[idx] });
      idx++;
      continue;
    }

    if (line.startsWith('interface ') || line.startsWith('export interface ')) {
      const interfaceResult = collectBraceBlock(lines, idx);
      if (!interfaceResult) {
        break;
      }

      currentConfiguredPart = pushSectionEntry(
        sectionParts,
        currentConfiguredPart,
        configuredGroups,
        'interfaces',
        sortTypeMembers(interfaceResult.block, config)
      );
      idx = interfaceResult.nextIdx;
      continue;
    }

    if (line.startsWith('type ') || line.startsWith('export type ')) {
      const typeResult = collectTypeBlock(lines, idx);
      if (!typeResult) {
        break;
      }

      currentConfiguredPart = pushSectionEntry(
        sectionParts,
        currentConfiguredPart,
        configuredGroups,
        'interfaces',
        sortTypeMembers(typeResult.block, config)
      );
      idx = typeResult.nextIdx;
      continue;
    }

    if (isFunctionLikeStart(line)) {
      const functionResult = collectFunctionBlock(lines, idx);
      if (!functionResult) {
        break;
      }

      currentConfiguredPart = pushSectionEntry(
        sectionParts,
        currentConfiguredPart,
        configuredGroups,
        'functions',
        functionResult.block
      );
      idx = functionResult.nextIdx;
      continue;
    }

    if (!line.startsWith('import')) {
      break;
    }

    const importResult = collectImportBlock(lines, idx);
    if (!importResult) {
      break;
    }

    const importGroup = getImportGroup(importResult.block, config);
    if (!importGroup) {
      break;
    }

    const blockValue = configuredGroups.has(importGroup)
      ? formatImportBlock(importResult.block, config)
      : importResult.block;

    currentConfiguredPart = pushSectionEntry(
      sectionParts,
      currentConfiguredPart,
      configuredGroups,
      importGroup,
      blockValue
    );
    idx = importResult.nextIdx;
  }

  if (currentConfiguredPart) {
    sectionParts.push(currentConfiguredPart);
  }

  const rest = lines.slice(idx).join('\n').trim();
  const renderedParts = sectionParts
    .map((part) =>
      part.type === 'configured' ? buildConfiguredPart(part.groups, config) : part.value
    )
    .filter(Boolean);
  const section = renderedParts.reduce((result, part, index) => {
    if (index === 0) {
      return part;
    }

    const previousPart = sectionParts[index - 1];
    const currentPart = sectionParts[index];
    const separator =
      previousPart?.type === 'comment' ||
      currentPart?.type === 'comment' ||
      (previousPart?.type === 'raw' && currentPart?.type === 'raw')
        ? '\n'
        : '\n\n';

    return `${result}${separator}${part}`;
  }, '');

  if (!section && !rest) {
    return '\n';
  }

  if (!section) {
    return `${rest}\n`;
  }

  if (!rest) {
    return `${section}\n`;
  }

  return `${section}\n\n${rest}`.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function pushSectionEntry(
  sectionParts: SectionPart[],
  currentConfiguredPart: ConfiguredSectionPart | null,
  configuredGroups: Set<GroupKey>,
  group: Exclude<GroupKey, 'comments'>,
  value: string
): ConfiguredSectionPart | null {
  if (!configuredGroups.has(group)) {
    if (currentConfiguredPart) {
      sectionParts.push(currentConfiguredPart);
    }

    sectionParts.push({ type: 'raw', value });
    return null;
  }

  const configuredPart = currentConfiguredPart ?? {
    type: 'configured' as const,
    groups: createEmptyGroups(),
  };

  configuredPart.groups[group].push(value);
  return configuredPart;
}

function createEmptyGroups(): ImportGroups {
  return {
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
}

function getConfiguredGroups(groupsOrder: GroupOrderItem[]): Set<GroupKey> {
  return new Set(
    groupsOrder.filter((group): group is GroupKey => group !== '__separator__')
  );
}

function buildConfiguredPart(groups: ImportGroups, config: SortConfig): string {
  const parts: string[] = [];
  let pendingBlankLine = false;

  for (const group of config.groupsOrder) {
    if (group === '__separator__') {
      pendingBlankLine = parts.length > 0;
      continue;
    }

    const block = getGroupBlock(group, groups, config);
    if (!block) {
      continue;
    }

    if (parts.length > 0) {
      parts.push(pendingBlankLine ? '\n\n' : '\n');
    }

    parts.push(block);
    pendingBlankLine = false;
  }

  return parts.join('');
}

function getGroupBlock(
  group: GroupKey,
  groups: ImportGroups,
  config: SortConfig
): string | null {
  const prepareImports = (items: string[]) =>
    config.mergeDuplicateImports ? mergeImportStatements(items, config) : [...items];
  const sortByMode = (a: string, b: string) =>
    config.sortMode === 'alphabetical'
      ? compareImportStatements(a, b, config.sortMode)
      : compareStrings(a, b, config.sortMode);
  const sortByLength = (a: string, b: string) => compareStrings(a, b, 'length');
  const mergeAndSort = (items: string[]) =>
    prepareImports(items).sort(sortByMode).join('\n');

  switch (group) {
    case 'directives':
      return groups.directives.length ? groups.directives.join('\n') : null;
    case 'react':
      if (!groups.react.length) {
        return null;
      }
      return config.sortMode === 'alphabetical'
        ? mergeAndSort(groups.react)
        : prepareImports(groups.react).sort(sortByLength).join('\n');
    case 'libraries':
      return groups.libraries.length ? mergeAndSort(groups.libraries) : null;
    case 'absolute':
      return groups.absolute.length ? mergeAndSort(groups.absolute) : null;
    case 'relative':
      return groups.relative.length ? mergeAndSort(groups.relative) : null;
    case 'sideEffect':
      return groups.sideEffect.length ? mergeAndSort(groups.sideEffect) : null;
    case 'styles':
      return groups.styles.length ? mergeAndSort(groups.styles) : null;
    case 'interfaces':
      return groups.interfaces.length ? groups.interfaces.join('\n') : null;
    case 'comments':
      if (!groups.comments.length) {
        return null;
      }
      return [...groups.comments]
        .sort((a, b) => a.originalIndex - b.originalIndex)
        .map((comment) => comment.line)
        .join('\n');
    case 'functions':
      return groups.functions.length ? groups.functions.join('\n\n') : null;
    default:
      return null;
  }
}

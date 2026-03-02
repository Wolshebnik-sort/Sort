const Module = require('node:module');
const path = require('node:path');

const contentSorterModulePath = path.resolve(
  __dirname,
  '../../out/sortContent/contentSorter.js'
);
const styleSorterModulePath = path.resolve(
  __dirname,
  '../../out/sortContent/style/sorter.js'
);
const providerModulePath = path.resolve(__dirname, '../../out/sortContentProvider.js');
const configModulePath = path.resolve(__dirname, '../../out/sortContent/config.js');
const aliasResolverModulePath = path.resolve(
  __dirname,
  '../../out/sortContent/projectAliasResolver.js'
);

function withMockedVscode(vscodeMock, loadModule) {
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return vscodeMock;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return loadModule();
  } finally {
    Module._load = originalLoad;
  }
}

function createConfig(overrides = {}) {
  return {
    maxLineLength: 100,
    indentSize: '  ',
    aliasPrefixes: ['@/', '~/', 'src/'],
    detectAliasesFromProjectConfig: false,
    enableStyleSorting: false,
    styleExtensions: ['.css', '.scss', '.sass', '.less'],
    styleGroupsOrder: [
      'customProperties',
      'position',
      'size',
      'spacing',
      'layout',
      'overflow',
      'typography',
      'visual',
      'effects',
      'interaction',
    ],
    groupsOrder: [
      'directives',
      'spacing',
      'react',
      'spacing',
      'libraries',
      'spacing',
      'absolute',
      'spacing',
      'relative',
      'spacing',
      'sideEffect',
      'spacing',
      'styles',
      'spacing',
      'interfaces',
      'spacing',
      'comments',
      'spacing',
      'functions',
    ],
    sortOnSave: false,
    sortMode: 'length',
    mergeDuplicateImports: false,
    ...overrides,
  };
}

function createSortConfig(overrides = {}) {
  const config = createConfig(overrides);

  return {
    maxLineLength: config.maxLineLength,
    indent: config.indentSize,
    aliasPrefixes: config.aliasPrefixes,
    detectAliasesFromProjectConfig: config.detectAliasesFromProjectConfig,
    enableStyleSorting: config.enableStyleSorting,
    sortMode: config.sortMode,
    mergeDuplicateImports: config.mergeDuplicateImports,
    styleExtensions: config.styleExtensions,
    styleGroupsOrder: config.styleGroupsOrder,
    groupsOrder: normalizeGroupsOrder(config.groupsOrder),
  };
}

function normalizeGroupsOrder(groupsOrder) {
  const result = [];

  for (const group of groupsOrder) {
    if (group === 'spacing') {
      if (result.length > 0 && result[result.length - 1] !== '__separator__') {
        result.push('__separator__');
      }
      continue;
    }

    result.push(group);
  }

  while (result[result.length - 1] === '__separator__') {
    result.pop();
  }

  return result;
}

function loadProvider(configValues) {
  const vscodeMock = {
    workspace: {
      getConfiguration: () => ({
        get(key, defaultValue) {
          return key in configValues ? configValues[key] : defaultValue;
        },
      }),
      getWorkspaceFolder: () => undefined,
    },
    Uri: {
      file(fsPath) {
        return { fsPath, scheme: 'file' };
      },
    },
  };

  delete require.cache[providerModulePath];
  delete require.cache[configModulePath];
  delete require.cache[aliasResolverModulePath];

  return withMockedVscode(vscodeMock, () => require(providerModulePath).SortContentProvider);
}

function loadContentSorter() {
  delete require.cache[contentSorterModulePath];
  return require(contentSorterModulePath).sortContent;
}

function loadStyleSorter() {
  delete require.cache[styleSorterModulePath];
  return require(styleSorterModulePath).sortStyleContent;
}

function sortWithConfig(input, overrides) {
  const sortContent = loadContentSorter();
  return sortContent(input, createSortConfig(overrides));
}

function sortStyleWithIndent(input, indent = '  ', groupsOrder) {
  const sortStyleContent = loadStyleSorter();
  return sortStyleContent(
    input,
    groupsOrder ? { indent, groupsOrder } : indent
  );
}

module.exports = {
  createConfig,
  createSortConfig,
  loadProvider,
  sortWithConfig,
  sortStyleWithIndent,
  withMockedVscode,
};

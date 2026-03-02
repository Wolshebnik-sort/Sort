const test = require('node:test');
const assert = require('node:assert/strict');

const { createConfig, loadProvider } = require('./helpers/sortHarness');

test('SortContentProvider delegates to content sorting using document-scoped config', () => {
  const SortContentProvider = loadProvider(
    createConfig({
      groupsOrder: ['relative'],
      sortMode: 'alphabetical',
    })
  );
  const provider = new SortContentProvider();

  const result = provider.getSortedContent({
    getText: () => ["import b from './b';", "import a from './a';"].join('\n'),
    uri: { scheme: 'file', fsPath: '/workspace/example.ts' },
  });

  assert.equal(
    result,
    ["import a from './a';", "import b from './b';", ''].join('\n')
  );
});

test('SortContentProvider leaves style files unchanged when style sorting is disabled', () => {
  const SortContentProvider = loadProvider(createConfig());
  const provider = new SortContentProvider();
  const input = ['.box {', '  color: red;', '  margin: 0;', '}', ''].join('\n');

  const result = provider.getSortedContent({
    getText: () => input,
    languageId: 'scss',
    uri: { scheme: 'file', fsPath: '/workspace/example.scss' },
  });

  assert.equal(result, input);
});

test('SortContentProvider sorts style files when style sorting is enabled', () => {
  const SortContentProvider = loadProvider(
    createConfig({
      enableStyleSorting: true,
    })
  );
  const provider = new SortContentProvider();

  const result = provider.getSortedContent({
    getText: () => ['.box {', '  color: red;', '  margin: 0;', '}', ''].join('\n'),
    languageId: 'scss',
    uri: { scheme: 'file', fsPath: '/workspace/example.scss' },
  });

  assert.equal(result, ['.box {', '  margin: 0;', '', '  color: red;', '}', ''].join('\n'));
});

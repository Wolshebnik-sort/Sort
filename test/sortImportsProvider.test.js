const test = require('node:test');
const assert = require('node:assert/strict');
const { sortWithConfig } = require('./helpers/sortHarness');

test('omitted groups stay in place while configured groups are still sorted', () => {
  const input = [
    "import zebra from 'zebra';",
    "import b from './b';",
    "import a from './a';",
  ].join('\n');

  const result = sortWithConfig(input, {
    groupsOrder: ['relative'],
    sortMode: 'alphabetical',
  });

  assert.equal(
    result,
    [
      "import zebra from 'zebra';",
      '',
      "import a from './a';",
      "import b from './b';",
      '',
    ].join('\n')
  );
});

test('adjacent omitted imports do not get blank lines inserted between them', () => {
  const input = [
    "import zebra from 'zebra';",
    "import alpha from 'alpha';",
    "import b from './b';",
    "import a from './a';",
  ].join('\n');

  const result = sortWithConfig(input, {
    groupsOrder: ['relative'],
    sortMode: 'alphabetical',
  });

  assert.equal(
    result,
    [
      "import zebra from 'zebra';",
      "import alpha from 'alpha';",
      '',
      "import a from './a';",
      "import b from './b';",
      '',
    ].join('\n')
  );
});

test('duplicate imports are merged when mergeDuplicateImports is enabled', () => {
  const input = [
    "import { beta } from './shared';",
    "import { alpha } from './shared';",
  ].join('\n');

  const result = sortWithConfig(input, {
    groupsOrder: ['relative'],
    sortMode: 'alphabetical',
    mergeDuplicateImports: true,
  });

  assert.equal(result, "import { alpha, beta } from './shared';\n");
});

test('duplicate imports stay separate when mergeDuplicateImports is disabled', () => {
  const input = [
    "import { beta } from './shared';",
    "import { alpha } from './shared';",
  ].join('\n');

  const result = sortWithConfig(input, {
    groupsOrder: ['relative'],
    sortMode: 'alphabetical',
    mergeDuplicateImports: false,
  });

  assert.equal(
    result,
    [
      "import { alpha } from './shared';",
      "import { beta } from './shared';",
      '',
    ].join('\n')
  );
});

test('omitted comments stay in place instead of moving into the configured section', () => {
  const input = [
    '// keep this comment here',
    "import z from 'zebra';",
    "import b from './b';",
    "import a from './a';",
  ].join('\n');

  const result = sortWithConfig(input, {
    groupsOrder: ['relative'],
    sortMode: 'alphabetical',
  });

  assert.equal(
    result,
    [
      '// keep this comment here',
      "import z from 'zebra';",
      '',
      "import a from './a';",
      "import b from './b';",
      '',
    ].join('\n')
  );
});

test('comments split sorting segments without adding blank lines around the comment', () => {
  const input = [
    "import z from './z';",
    '// note',
    "import bdgsfs from './b';",
    "import asd from './a';",
  ].join('\n');

  const result = sortWithConfig(input, {
    groupsOrder: ['relative'],
    sortMode: 'alphabetical',
  });

  assert.equal(
    result,
    [
      "import z from './z';",
      '// note',
      "import asd from './a';",
      "import bdgsfs from './b';",
      '',
    ].join('\n')
  );
});

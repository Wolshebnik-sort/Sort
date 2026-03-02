const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { withMockedVscode } = require('./helpers/sortHarness');

const aliasResolverModulePath = path.resolve(
  __dirname,
  '../out/sortContent/projectAliasResolver.js'
);

function createTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sort-imports-alias-test-'));
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function loadResolver(workspaceRoot) {
  const vscodeMock = {
    workspace: {
      getWorkspaceFolder(uri) {
        if (!uri?.fsPath?.startsWith(workspaceRoot)) {
          return undefined;
        }

        return { uri: { fsPath: workspaceRoot } };
      },
    },
    Uri: {
      file(fsPath) {
        return { fsPath, scheme: 'file' };
      },
    },
  };

  delete require.cache[aliasResolverModulePath];

  return withMockedVscode(vscodeMock, () => require(aliasResolverModulePath));
}

test('resolveAliasPrefixes falls back to manual aliases plus defaults when detection is disabled', () => {
  const workspaceRoot = createTempProject();
  const { resolveAliasPrefixes } = loadResolver(workspaceRoot);

  const result = resolveAliasPrefixes(
    { scheme: 'file', fsPath: path.join(workspaceRoot, 'src/example.ts') },
    ['@manual/', 'src/'],
    false
  );

  assert.deepEqual(result, ['@manual/', 'src/', '@/', '~/']);
});

test('resolveAliasPrefixes reads aliases from tsconfig and extended configs', () => {
  const workspaceRoot = createTempProject();
  writeFile(
    path.join(workspaceRoot, 'tsconfig.base.json'),
    `{
      // base aliases
      "compilerOptions": {
        "paths": {
          "@base/*": ["src/base/*"],
        },
      },
    }`
  );
  writeFile(
    path.join(workspaceRoot, 'tsconfig.json'),
    `{
      "extends": "./tsconfig.base.json",
      "compilerOptions": {
        "paths": {
          "@app/*": ["src/app/*"]
        }
      }
    }`
  );

  const { resolveAliasPrefixes } = loadResolver(workspaceRoot);
  const result = resolveAliasPrefixes(
    { scheme: 'file', fsPath: path.join(workspaceRoot, 'src/example.ts') },
    ['@manual/'],
    true
  );

  assert.deepEqual(result, ['@manual/', '@app/', '@base/', '@/', '~/', 'src/']);
});

test('resolveAliasPrefixes follows tsconfig references', () => {
  const workspaceRoot = createTempProject();
  writeFile(
    path.join(workspaceRoot, 'packages/shared/tsconfig.json'),
    `{
      "compilerOptions": {
        "paths": {
          "@shared/*": ["src/*"]
        }
      }
    }`
  );
  writeFile(
    path.join(workspaceRoot, 'tsconfig.json'),
    `{
      "references": [{ "path": "./packages/shared" }]
    }`
  );

  const { resolveAliasPrefixes } = loadResolver(workspaceRoot);
  const result = resolveAliasPrefixes(
    { scheme: 'file', fsPath: path.join(workspaceRoot, 'src/example.ts') },
    [],
    true
  );

  assert.deepEqual(result, ['@shared/', '@/', '~/', 'src/']);
});

test('resolveAliasPrefixes reads aliases from vite and webpack configs', () => {
  const workspaceRoot = createTempProject();
  writeFile(
    path.join(workspaceRoot, 'tsconfig.json'),
    `{
      "compilerOptions": {}
    }`
  );
  writeFile(
    path.join(workspaceRoot, 'vite.config.ts'),
    `export default {
      resolve: {
        alias: {
          "@ui": "/src/ui",
          "@shared/": "/src/shared"
        }
      }
    };`
  );
  writeFile(
    path.join(workspaceRoot, 'webpack.config.js'),
    `module.exports = {
      resolve: {
        alias: [
          { find: '@features', replacement: '/src/features' }
        ]
      }
    };`
  );

  const { resolveAliasPrefixes } = loadResolver(workspaceRoot);
  const result = resolveAliasPrefixes(
    { scheme: 'file', fsPath: path.join(workspaceRoot, 'src/example.ts') },
    ['@manual/'],
    true
  );

  assert.deepEqual(
    result,
    ['@manual/', '@ui/', '@shared/', '@features/', '@/', '~/', 'src/']
  );
});

test('resolveAliasPrefixes falls back when no project config is found nearby', () => {
  const workspaceRoot = createTempProject();
  const { resolveAliasPrefixes } = loadResolver(workspaceRoot);

  const result = resolveAliasPrefixes(
    { scheme: 'file', fsPath: path.join(workspaceRoot, 'nested/example.ts') },
    ['@manual/'],
    true
  );

  assert.deepEqual(result, ['@manual/', '@/', '~/', 'src/']);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { sortWithConfig } = require('./helpers/sortHarness');

const fixturesDir = path.resolve(__dirname, 'fixtures');
const fixtureConfigFiles = fs
  .readdirSync(fixturesDir)
  .filter((fileName) => fileName.endsWith('.config.json'))
  .sort();

for (const configFileName of fixtureConfigFiles) {
  const fixtureName = configFileName.replace(/\.config\.json$/, '');
  const configPath = path.join(fixturesDir, configFileName);
  const inputPath = path.join(fixturesDir, `${fixtureName}.input.ts`);
  const expectedPath = path.join(fixturesDir, `${fixtureName}.expected.ts`);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const input = fs.readFileSync(inputPath, 'utf8');
  const expected = fs.readFileSync(expectedPath, 'utf8');

  test(`fixture: ${fixtureName}`, () => {
    const result = sortWithConfig(input, config);
    assert.equal(result, expected);
  });
}

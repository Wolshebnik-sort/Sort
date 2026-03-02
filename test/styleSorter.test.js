const test = require('node:test');
const assert = require('node:assert/strict');

const { sortStyleWithIndent } = require('./helpers/sortHarness');

test('sortStyleContent sorts declarations in a block and recursively sorts nested selectors', () => {
  const input = [
    '.card {',
    '  color: red;',
    '  padding: 12px;',
    '',
    '  &:hover {',
    '    color: blue;',
    '    display: block;',
    '  }',
    '',
    '  margin: 0;',
    '}',
    '',
  ].join('\n');

  const result = sortStyleWithIndent(input);

  assert.equal(
    result,
    [
      '.card {',
      '  margin: 0;',
      '  padding: 12px;',
      '',
      '  color: red;',
      '',
      '  &:hover {',
      '    display: block;',
      '',
      '    color: blue;',
      '  }',
      '}',
      '',
    ].join('\n')
  );
});

test('sortStyleContent sorts declarations inside media queries without moving the media block', () => {
  const input = [
    '.card {',
    '  color: red;',
    '',
    '  @media (max-width: 768px) {',
    '    color: blue;',
    '    margin: 0;',
    '    display: block;',
    '  }',
    '',
    '  padding: 12px;',
    '}',
    '',
  ].join('\n');

  const result = sortStyleWithIndent(input);

  assert.equal(
    result,
    [
      '.card {',
      '  padding: 12px;',
      '',
      '  color: red;',
      '',
      '  @media (max-width: 768px) {',
      '    margin: 0;',
      '',
      '    display: block;',
      '',
      '    color: blue;',
      '  }',
      '}',
      '',
    ].join('\n')
  );
});

test('sortStyleContent keeps logical spacing properties above layout properties', () => {
  const input = [
    '.header-partners {',
    '  gap: 60px;',
    '',
    '  padding-inline: 40px;',
    '',
    '  @media screen and (max-width: 768px) {',
    '    padding: 20px 18px 10px;',
    '',
    '    flex-wrap: wrap;',
    '    gap: 20px;',
    '  }',
    '',
    '  &.tablet {',
    '    justify-content: space-between;',
    '  }',
    '}',
    '',
  ].join('\n');

  const result = sortStyleWithIndent(input);

  assert.equal(
    result,
    [
      '.header-partners {',
      '  padding-inline: 40px;',
      '',
      '  gap: 60px;',
      '',
      '  @media screen and (max-width: 768px) {',
      '    padding: 20px 18px 10px;',
      '',
      '    flex-wrap: wrap;',
      '    gap: 20px;',
      '  }',
      '',
      '  &.tablet {',
      '    justify-content: space-between;',
      '  }',
      '}',
      '',
    ].join('\n')
  );
});

test('sortStyleContent groups spacing family properties even when they are not explicitly listed', () => {
  const input = [
    '.box {',
    '  gap: 12px;',
    '  padding-box: border-box;',
    '}',
    '',
  ].join('\n');

  const result = sortStyleWithIndent(input);

  assert.equal(
    result,
    [
      '.box {',
      '  padding-box: border-box;',
      '',
      '  gap: 12px;',
      '}',
      '',
    ].join('\n')
  );
});

test('sortStyleContent moves custom properties to the top of the block', () => {
  const input = [
    '.overlay {',
    '  color: white;',
    '  --bg: rgba(0, 0, 0, 0.8);',
    '  padding: 12px;',
    '}',
    '',
  ].join('\n');

  const result = sortStyleWithIndent(input);

  assert.equal(
    result,
    [
      '.overlay {',
      '  --bg: rgba(0, 0, 0, 0.8);',
      '',
      '  padding: 12px;',
      '',
      '  color: white;',
      '}',
      '',
    ].join('\n')
  );
});

test('sortStyleContent keeps scss interpolation custom properties with other custom properties at the top', () => {
  const input = [
    '.wrapper-present-icons {',
    '  width: 100%;',
    '  height: auto;',
    '',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  gap: 16px;',
    '',
    '  --bg: rgba(0, 0, 0, 0.8);',
    '',
    '  --color: #{$color-white};',
    '}',
    '',
  ].join('\n');

  const result = sortStyleWithIndent(input);

  assert.equal(
    result,
    [
      '.wrapper-present-icons {',
      '  --bg: rgba(0, 0, 0, 0.8);',
      '  --color: #{$color-white};',
      '',
      '  width: 100%;',
      '  height: auto;',
      '',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 16px;',
      '}',
      '',
    ].join('\n')
  );
});

test('sortStyleContent allows reordering style groups while keeping built-in property order inside each group', () => {
  const input = [
    '.card {',
    '  color: red;',
    '  margin: 0;',
    '  display: flex;',
    '}',
    '',
  ].join('\n');

  const result = sortStyleWithIndent(input, '  ', [
    'customProperties',
    'layout',
    'spacing',
    'size',
    'position',
    'overflow',
    'typography',
    'visual',
    'effects',
    'interaction',
  ]);

  assert.equal(
    result,
    [
      '.card {',
      '  display: flex;',
      '',
      '  margin: 0;',
      '',
      '  color: red;',
      '}',
      '',
    ].join('\n')
  );
});

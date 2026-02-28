import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const DEFAULT_ALIAS_PREFIXES = ['@/', '~/', 'src/'];
const PROJECT_CONFIG_FILES = ['tsconfig.json', 'jsconfig.json'];
const BUNDLER_CONFIG_FILES = [
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mts',
  'vite.config.mjs',
  'vite.config.cts',
  'vite.config.cjs',
  'webpack.config.ts',
  'webpack.config.js',
  'webpack.config.mts',
  'webpack.config.mjs',
  'webpack.config.cts',
  'webpack.config.cjs',
];

export function resolveAliasPrefixes(
  documentUri: vscode.Uri | undefined,
  manualAliasPrefixes: string[],
  detectFromProjectConfig: boolean
): string[] {
  const normalizedManualPrefixes = normalizeAliasPrefixes(manualAliasPrefixes);
  const normalizedDefaultPrefixes = normalizeAliasPrefixes(DEFAULT_ALIAS_PREFIXES);

  if (!detectFromProjectConfig || !documentUri || documentUri.scheme !== 'file') {
    return uniquePreservingOrder([...normalizedManualPrefixes, ...normalizedDefaultPrefixes]);
  }

  const projectRoot = findNearestProjectRoot(documentUri.fsPath);
  if (!projectRoot) {
    return uniquePreservingOrder([...normalizedManualPrefixes, ...normalizedDefaultPrefixes]);
  }

  const detectedPrefixes = [
    ...resolveTypeScriptAliasPrefixes(projectRoot),
    ...resolveBundlerAliasPrefixes(projectRoot),
  ];

  return uniquePreservingOrder([
    ...normalizedManualPrefixes,
    ...normalizeAliasPrefixes(detectedPrefixes),
    ...normalizedDefaultPrefixes,
  ]);
}

function findNearestProjectRoot(filePath: string): string | null {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  const workspaceRoot = workspaceFolder?.uri.fsPath ?? path.parse(filePath).root;
  let currentDir = path.dirname(filePath);

  while (currentDir.startsWith(workspaceRoot)) {
    if (hasAnyProjectConfig(currentDir)) {
      return currentDir;
    }

    if (currentDir === workspaceRoot) {
      break;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return null;
}

function hasAnyProjectConfig(directoryPath: string): boolean {
  return [...PROJECT_CONFIG_FILES, ...BUNDLER_CONFIG_FILES].some((fileName) =>
    fs.existsSync(path.join(directoryPath, fileName))
  );
}

function resolveTypeScriptAliasPrefixes(projectRoot: string): string[] {
  const configPaths = PROJECT_CONFIG_FILES.map((fileName) => path.join(projectRoot, fileName)).filter((filePath) =>
    fs.existsSync(filePath)
  );
  const detectedPrefixes: string[] = [];
  const visitedConfigPaths = new Set<string>();

  for (const configPath of configPaths) {
    collectTypeScriptAliases(configPath, visitedConfigPaths, detectedPrefixes);
  }

  return detectedPrefixes;
}

function collectTypeScriptAliases(
  configPath: string,
  visitedConfigPaths: Set<string>,
  output: string[]
): void {
  const normalizedConfigPath = path.normalize(configPath);
  if (visitedConfigPaths.has(normalizedConfigPath) || !fs.existsSync(normalizedConfigPath)) {
    return;
  }

  visitedConfigPaths.add(normalizedConfigPath);

  const parsedConfig = parseJsoncFile(normalizedConfigPath);
  if (!parsedConfig || typeof parsedConfig !== 'object') {
    return;
  }

  const compilerOptions = asObject(parsedConfig.compilerOptions);
  const pathsConfig = asObject(compilerOptions?.paths);
  if (pathsConfig) {
    for (const aliasKey of Object.keys(pathsConfig)) {
      const normalizedAliasPrefix = normalizeAliasPrefix(aliasKey);
      if (normalizedAliasPrefix) {
        output.push(normalizedAliasPrefix);
      }
    }
  }

  const extendsConfig = parsedConfig.extends;
  if (typeof extendsConfig === 'string') {
    const extendedConfigPath = resolveExtendedConfigPath(normalizedConfigPath, extendsConfig);
    if (extendedConfigPath) {
      collectTypeScriptAliases(extendedConfigPath, visitedConfigPaths, output);
    }
  }

  const references = Array.isArray(parsedConfig.references) ? parsedConfig.references : [];
  for (const reference of references) {
    const referencePath = typeof reference?.path === 'string' ? reference.path : null;
    if (!referencePath) {
      continue;
    }

    const resolvedReferenceConfigPath = resolveReferencedConfigPath(normalizedConfigPath, referencePath);
    if (resolvedReferenceConfigPath) {
      collectTypeScriptAliases(resolvedReferenceConfigPath, visitedConfigPaths, output);
    }
  }
}

function resolveBundlerAliasPrefixes(projectRoot: string): string[] {
  const detectedPrefixes: string[] = [];

  for (const fileName of BUNDLER_CONFIG_FILES) {
    const configPath = path.join(projectRoot, fileName);
    if (!fs.existsSync(configPath)) {
      continue;
    }

    detectedPrefixes.push(...extractBundlerAliases(configPath));
  }

  return detectedPrefixes;
}

function extractBundlerAliases(configPath: string): string[] {
  const fileContents = readTextFile(configPath);
  if (!fileContents) {
    return [];
  }

  const detectedPrefixes: string[] = [];

  for (const aliasBody of findPropertyBlocks(fileContents, 'alias', '{', '}')) {
    detectedPrefixes.push(...extractAliasKeysFromObject(aliasBody));
  }

  for (const aliasBody of findPropertyBlocks(fileContents, 'alias', '[', ']')) {
    detectedPrefixes.push(...extractAliasKeysFromArray(aliasBody));
  }

  return normalizeAliasPrefixes(detectedPrefixes);
}

function extractAliasKeysFromObject(objectBody: string): string[] {
  const detectedPrefixes: string[] = [];
  const propertyPattern = /(?:['"`]([^'"`]+)['"`]|([A-Za-z_$][\w$-]*))\s*:/g;

  for (const match of objectBody.matchAll(propertyPattern)) {
    const rawAliasKey = match[1] ?? match[2];
    const normalizedAliasPrefix = normalizeAliasPrefix(rawAliasKey);
    if (normalizedAliasPrefix) {
      detectedPrefixes.push(normalizedAliasPrefix);
    }
  }

  return detectedPrefixes;
}

function extractAliasKeysFromArray(arrayBody: string): string[] {
  const detectedPrefixes: string[] = [];
  const findPattern = /find\s*:\s*(['"`])([^'"`]+)\1/g;

  for (const match of arrayBody.matchAll(findPattern)) {
    const normalizedAliasPrefix = normalizeAliasPrefix(match[2]);
    if (normalizedAliasPrefix) {
      detectedPrefixes.push(normalizedAliasPrefix);
    }
  }

  return detectedPrefixes;
}

function findPropertyBlocks(
  sourceText: string,
  propertyName: string,
  openChar: '{' | '[',
  closeChar: '}' | ']'
): string[] {
  const results: string[] = [];
  const propertyPattern = new RegExp(`${propertyName}\\s*:\\s*\\${openChar}`, 'g');
  let match: RegExpExecArray | null = null;

  while ((match = propertyPattern.exec(sourceText)) !== null) {
    const openIndex = sourceText.indexOf(openChar, match.index);
    if (openIndex === -1) {
      continue;
    }

    const closeIndex = findMatchingDelimiterIndex(sourceText, openIndex, openChar, closeChar);
    if (closeIndex === -1) {
      continue;
    }

    results.push(sourceText.slice(openIndex + 1, closeIndex));
    propertyPattern.lastIndex = closeIndex + 1;
  }

  return results;
}

function findMatchingDelimiterIndex(
  text: string,
  openIndex: number,
  openChar: '{' | '[',
  closeChar: '}' | ']'
): number {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = openIndex; index < text.length; index++) {
    const char = text[index];
    const nextChar = text[index + 1];
    const prevChar = text[index - 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (prevChar === '*' && char === '/') {
        inBlockComment = false;
      }
      continue;
    }

    if (inSingleQuote) {
      if (char === "'" && prevChar !== '\\') {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"' && prevChar !== '\\') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inTemplateString) {
      if (char === '`' && prevChar !== '\\') {
        inTemplateString = false;
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index++;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index++;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === '`') {
      inTemplateString = true;
      continue;
    }

    if (char === openChar) {
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function resolveExtendedConfigPath(fromConfigPath: string, extendsValue: string): string | null {
  if (!extendsValue.startsWith('.')) {
    return null;
  }

  return resolveConfigPathCandidate(path.resolve(path.dirname(fromConfigPath), extendsValue));
}

function resolveReferencedConfigPath(fromConfigPath: string, referencePath: string): string | null {
  const resolvedReferencePath = path.resolve(path.dirname(fromConfigPath), referencePath);

  if (fs.existsSync(resolvedReferencePath) && fs.statSync(resolvedReferencePath).isDirectory()) {
    return PROJECT_CONFIG_FILES.map((fileName) => path.join(resolvedReferencePath, fileName)).find((filePath) =>
      fs.existsSync(filePath)
    ) ?? resolveConfigPathCandidate(path.join(resolvedReferencePath, 'tsconfig'));
  }

  return resolveConfigPathCandidate(resolvedReferencePath);
}

function resolveConfigPathCandidate(basePath: string): string | null {
  const candidates = [basePath];
  if (!basePath.endsWith('.json')) {
    candidates.push(`${basePath}.json`);
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function parseJsoncFile(filePath: string): any | null {
  const fileContents = readTextFile(filePath);
  if (!fileContents) {
    return null;
  }

  try {
    return JSON.parse(stripJsonCommentsAndTrailingCommas(fileContents));
  } catch {
    return null;
  }
}

function stripJsonCommentsAndTrailingCommas(text: string): string {
  const withoutComments = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');

  return withoutComments.replace(/,\s*([}\]])/g, '$1');
}

function readTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function normalizeAliasPrefixes(prefixes: string[]): string[] {
  return uniquePreservingOrder(
    prefixes
      .map((prefix) => normalizeAliasPrefix(prefix))
      .filter((prefix): prefix is string => Boolean(prefix))
  );
}

function normalizeAliasPrefix(prefix: string): string | null {
  const trimmedPrefix = prefix.trim().replace(/\*+$/g, '').replace(/\$$/, '');
  if (!trimmedPrefix) {
    return null;
  }

  return trimmedPrefix.endsWith('/') ? trimmedPrefix : `${trimmedPrefix}/`;
}

function uniquePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

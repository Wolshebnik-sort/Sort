import { GroupKey } from './types';
import { StyleGroupKey } from './style/types';

export const DEFAULT_ALIAS_PREFIXES = ['@/', '~/', 'src/'];

export const DEFAULT_STYLE_EXTENSIONS = ['.css', '.scss', '.sass', '.less'];

export const DEFAULT_STYLE_GROUP_ORDER: StyleGroupKey[] = [
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
];

export const DEFAULT_GROUP_ORDER: GroupKey[] = [
  'directives',
  'react',
  'libraries',
  'absolute',
  'relative',
  'sideEffect',
  'styles',
  'interfaces',
  'comments',
  'functions',
];

export const DEFAULT_GROUP_ORDER_WITH_SEPARATORS: string[] = [
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
];

export const PROJECT_CONFIG_FILES = ['tsconfig.json', 'jsconfig.json'];

export const BUNDLER_CONFIG_FILES = [
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

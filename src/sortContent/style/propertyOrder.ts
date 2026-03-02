import { DEFAULT_STYLE_GROUP_ORDER } from '../defaults';
import { StyleGroupKey } from './types';

type StylePropertyOrder = {
  groupRank: number;
  propertyRank: number;
};

type PropertyDefinition = {
  group: StyleGroupKey;
  property: string;
};

type PropertyFamilyRule = {
  group: StyleGroupKey;
  propertyRank: number;
  prefix: string;
};

const STYLE_PROPERTY_DEFINITIONS: PropertyDefinition[] = [
  ...defineGroup('position', ['position', 'top', 'right', 'bottom', 'left', 'z-index']),
  ...defineGroup('size', [
    'box-sizing',
    'width',
    'min-width',
    'max-width',
    'height',
    'min-height',
    'max-height',
  ]),
  ...defineGroup('spacing', [
    'margin',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'padding',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
  ]),
  ...defineGroup('layout', [
    'display',
    'flex',
    'flex-grow',
    'flex-shrink',
    'flex-basis',
    'flex-direction',
    'flex-wrap',
    'flex-flow',
    'justify-content',
    'align-items',
    'align-content',
    'align-self',
    'order',
    'gap',
    'row-gap',
    'column-gap',
    'grid',
    'grid-template',
    'grid-template-rows',
    'grid-template-columns',
    'grid-template-areas',
    'grid-auto-rows',
    'grid-auto-columns',
    'grid-auto-flow',
    'grid-row',
    'grid-row-start',
    'grid-row-end',
    'grid-column',
    'grid-column-start',
    'grid-column-end',
    'grid-area',
    'place-items',
    'place-content',
    'place-self',
  ]),
  ...defineGroup('overflow', [
    'overflow',
    'overflow-x',
    'overflow-y',
    'scroll-behavior',
    'scroll-snap-type',
    'scroll-snap-align',
    'overscroll-behavior',
  ]),
  ...defineGroup('typography', [
    'font',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'text-align',
    'text-transform',
    'text-decoration',
    'text-overflow',
    'white-space',
    'word-break',
    'overflow-wrap',
    'vertical-align',
    'list-style',
  ]),
  ...defineGroup('visual', [
    'visibility',
    'opacity',
    'color',
    'background',
    'background-color',
    'background-image',
    'background-position',
    'background-size',
    'background-repeat',
    'border',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'box-shadow',
    'outline',
    'outline-offset',
    'filter',
    'backdrop-filter',
  ]),
  ...defineGroup('effects', [
    'transition',
    'animation',
    'transform',
    'transform-origin',
    'will-change',
  ]),
  ...defineGroup('interaction', [
    'cursor',
    'pointer-events',
    'user-select',
    'appearance',
    'resize',
    'caret-color',
    'accent-color',
  ]),
];

const STYLE_PROPERTY_ORDER = new Map<
  string,
  { group: StyleGroupKey; propertyRank: number }
>();

STYLE_PROPERTY_DEFINITIONS.forEach(({ group, property }) => {
  const propertyRank = STYLE_PROPERTY_DEFINITIONS.filter(
    (definition) => definition.group === group
  ).findIndex((definition) => definition.property === property);

  STYLE_PROPERTY_ORDER.set(property, { group, propertyRank });
});

const PROPERTY_FAMILY_RULES: PropertyFamilyRule[] = [
  family('position', 'inset'),
  family('size', 'min'),
  family('size', 'max'),
  family('spacing', 'margin'),
  family('spacing', 'padding'),
  family('layout', 'flex'),
  family('layout', 'grid'),
  family('layout', 'place'),
  family('overflow', 'overflow'),
  family('overflow', 'scroll'),
  family('overflow', 'overscroll'),
  family('typography', 'font'),
  family('typography', 'text'),
  family('typography', 'list'),
  family('visual', 'background'),
  family('visual', 'border'),
  family('visual', 'outline'),
  family('effects', 'transition'),
  family('effects', 'animation'),
  family('effects', 'transform'),
  family('interaction', 'pointer'),
  family('interaction', 'user'),
  family('interaction', 'caret'),
  family('interaction', 'accent'),
];

export function getStylePropertyOrder(
  property: string,
  styleGroupsOrder: StyleGroupKey[] = DEFAULT_STYLE_GROUP_ORDER
): StylePropertyOrder {
  const normalizedGroupOrder = normalizeStyleGroupsOrder(styleGroupsOrder);

  if (property.startsWith('--')) {
    return {
      groupRank: normalizedGroupOrder.indexOf('customProperties'),
      propertyRank: 0,
    };
  }

  const exactOrder = STYLE_PROPERTY_ORDER.get(property);
  if (exactOrder) {
    return {
      groupRank: normalizedGroupOrder.indexOf(exactOrder.group),
      propertyRank: exactOrder.propertyRank,
    };
  }

  const familyOrder = PROPERTY_FAMILY_RULES.find((rule) => matchesFamily(property, rule.prefix));
  if (familyOrder) {
    return {
      groupRank: normalizedGroupOrder.indexOf(familyOrder.group),
      propertyRank: familyOrder.propertyRank,
    };
  }

  return {
    groupRank: normalizedGroupOrder.length,
    propertyRank: Number.MAX_SAFE_INTEGER,
  };
}

function defineGroup(group: StyleGroupKey, properties: string[]): PropertyDefinition[] {
  return properties.map((property) => ({ group, property }));
}

function family(group: StyleGroupKey, prefix: string): PropertyFamilyRule {
  return {
    group,
    propertyRank: STYLE_PROPERTY_DEFINITIONS.filter(
      (definition) => definition.group === group
    ).length,
    prefix,
  };
}

function matchesFamily(property: string, prefix: string): boolean {
  return property === prefix || property.startsWith(`${prefix}-`);
}

function normalizeStyleGroupsOrder(styleGroupsOrder: StyleGroupKey[]): StyleGroupKey[] {
  const result: StyleGroupKey[] = [];

  for (const group of styleGroupsOrder) {
    if (!DEFAULT_STYLE_GROUP_ORDER.includes(group) || result.includes(group)) {
      continue;
    }

    result.push(group);
  }

  for (const group of DEFAULT_STYLE_GROUP_ORDER) {
    if (!result.includes(group)) {
      result.push(group);
    }
  }

  return result;
}

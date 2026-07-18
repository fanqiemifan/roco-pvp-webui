import fs from 'node:fs';
import path from 'node:path';

import { MAX_SELECTION_COUNT, SUPPORTED_IMAGE_EXTENSIONS } from '../../shared/constants.js';
import type { QuickFillPreview, SpriteRecord } from '../../shared/types.js';
import type { AppPaths } from './path-service.js';

const SPRITE_RESOURCE_BASE = '/resources/sprites-img';
const ATTRIBUTE_ICON_BASE = '/resources/attribute';

let cachedAttributeCodeByName: Map<string, string> | null = null;

function normalizeSpriteAttributes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
  }

  return String(value ?? '')
    .split(/[、/,，\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function spriteNumberFromFilename(filename: string): number | null {
  const match = /^NO\.(\d+)_/.exec(filename || '');
  return match ? Number(match[1]) : null;
}

function spriteVariantFromFilename(filename: string): number {
  const match = /-(\d+)$/.exec(path.parse(filename || '').name);
  return match ? Number(match[1]) : 0;
}

function spriteNumberFromValue(value: unknown): number | null {
  const match = /(\d+)/.exec(String(value ?? '').trim());
  return match ? Number(match[1]) : null;
}

function normalizeSearchName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function stripVariantSuffix(value: unknown): string {
  return String(value ?? '').trim().replace(/[-_](\d+)$/u, '');
}

function spriteVariantGroup(sprite: SpriteRecord): string {
  const displayName = sprite.displayName || '';
  if (displayName) {
    return normalizeSearchName(stripVariantSuffix(displayName));
  }
  return normalizeSearchName(stripVariantSuffix(path.parse(sprite.filename).name));
}

function spriteNumberAliases(sprite: SpriteRecord): string[] {
  if (typeof sprite.number !== 'number') {
    return [];
  }
  return [
    String(sprite.number),
    `${sprite.number}`.padStart(3, '0'),
    `no.${`${sprite.number}`.padStart(3, '0')}`,
    `no${`${sprite.number}`.padStart(3, '0')}`,
  ];
}

function buildSpriteEntry(filename: string): SpriteRecord {
  const stem = path.parse(filename).name;
  const displayName = stem.includes('_') ? stem.split('_', 2)[1] : stem;

  return {
    id: filename,
    filename,
    displayName,
    name: displayName,
    chineseName: displayName,
    cardName: stripVariantSuffix(displayName),
    path: `${SPRITE_RESOURCE_BASE}/${filename}`,
    aliases: [filename, stem],
    number: spriteNumberFromFilename(filename),
    variant: spriteVariantFromFilename(filename),
    attribute: '',
    attributeCodes: [],
    attributeIcon1: '',
    attributeIcon2: '',
    form: '',
  };
}

function loadAttributeCodeByName(paths: AppPaths): Map<string, string> {
  if (cachedAttributeCodeByName) {
    return cachedAttributeCodeByName;
  }

  const mappingFile = path.join(paths.dataDir, 'attribute_mapping.json');
  const lookup = new Map<string, string>();

  try {
    const payload = JSON.parse(fs.readFileSync(mappingFile, 'utf-8')) as Array<{ 编号?: string; 属性?: string }>;
    for (const item of payload) {
      const name = String(item?.属性 ?? '').trim();
      const code = String(item?.编号 ?? '').trim();
      if (name && code) {
        lookup.set(name, code);
      }
    }
  } catch {
    // Best effort only; consumers can still fall back to text attributes.
  }

  cachedAttributeCodeByName = lookup;
  return lookup;
}

function normalizeSpriteRecord(record: unknown, paths: AppPaths): SpriteRecord | null {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const item = record as Record<string, unknown>;
  const pathValue = typeof item.path === 'string' ? item.path : '';
  const filenameValue =
    typeof item.filename === 'string'
      ? item.filename
      : typeof item.id === 'string'
        ? item.id
        : pathValue
          ? path.basename(pathValue)
          : '';

  if (!filenameValue) {
    return null;
  }

  const filename = path.basename(filenameValue);
  const rawDisplayName =
    item.displayName
    ?? item['精灵名字2']
    ?? item['精灵名称']
    ?? item.chineseName
    ?? item.name
    ?? path.parse(filename).name;
  const displayName = String(
    rawDisplayName,
  );
  const aliases: string[] = [];

  for (const alias of [
    ...(Array.isArray(item.aliases) ? item.aliases : []),
    displayName,
    item['精灵名字2'],
    item['精灵名称'],
    item['精灵编号'],
    item.chineseName,
    item.name,
    stripVariantSuffix(displayName),
    filename,
    path.parse(filename).name,
  ]) {
    if (typeof alias === 'string' && alias.trim() && !aliases.includes(alias.trim())) {
      aliases.push(alias.trim());
    }
  }

  const number =
    typeof item.number === 'number'
      ? item.number
      : spriteNumberFromValue(item['精灵编号']) ?? spriteNumberFromFilename(filename);
  if (typeof number === 'number') {
    for (const alias of [String(number), `${number}`.padStart(3, '0'), `NO.${`${number}`.padStart(3, '0')}`]) {
      if (!aliases.includes(alias)) {
        aliases.push(alias);
      }
    }
  }

  const attribute = normalizeSpriteAttributes(item.attribute ?? item['精灵属性']).join('、');
  const attributeLookup = loadAttributeCodeByName(paths);
  const attributeCodes = Array.isArray(item.attributeCodes)
    ? item.attributeCodes.filter((code): code is string => typeof code === 'string' && code.trim().length > 0)
    : normalizeSpriteAttributes(item.attribute ?? item['精灵属性'])
      .map((attributeName) => attributeLookup.get(attributeName) ?? '')
      .filter(Boolean)
      .slice(0, 2);

  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : filename,
    filename,
    displayName,
    name: String(item.name ?? item['精灵名称'] ?? displayName).trim() || displayName,
    chineseName: String(item.chineseName ?? item['精灵名称'] ?? displayName).trim() || displayName,
    cardName: String(item.cardName ?? stripVariantSuffix(displayName)).trim() || stripVariantSuffix(displayName),
    path: typeof item.path === 'string' && item.path.trim()
      ? item.path.trim()
      : `${SPRITE_RESOURCE_BASE}/${filename}`,
    aliases,
    number,
    variant: typeof item.variant === 'number' ? item.variant : spriteVariantFromFilename(filename),
    attribute,
    attributeCodes,
    attributeIcon1:
      typeof item.attributeIcon1 === 'string' && item.attributeIcon1.trim()
        ? item.attributeIcon1
        : attributeCodes[0]
          ? `${ATTRIBUTE_ICON_BASE}/${attributeCodes[0]}.png`
          : '',
    attributeIcon2:
      typeof item.attributeIcon2 === 'string' && item.attributeIcon2.trim()
        ? item.attributeIcon2
        : attributeCodes[1]
          ? `${ATTRIBUTE_ICON_BASE}/${attributeCodes[1]}.png`
          : '',
    form: String(item.form ?? item['精灵形态'] ?? '').trim(),
  };
}

export function loadSpriteIndex(paths: AppPaths): SpriteRecord[] {
  const indexFile = path.join(paths.dataDir, 'sprites.json');
  if (!fs.existsSync(indexFile)) {
    return [];
  }

  try {
    const payload = JSON.parse(fs.readFileSync(indexFile, 'utf-8')) as
      | { sprites?: unknown[] }
      | unknown[];
    const sprites = Array.isArray(payload) ? payload : Array.isArray(payload.sprites) ? payload.sprites : [];
    const normalized = sprites
      .map((item) => normalizeSpriteRecord(item, paths))
      .filter((item): item is SpriteRecord => Boolean(item))
      .filter((item) => fs.existsSync(path.join(paths.spritesDir, item.filename)));

    normalized.sort((left, right) => {
      const leftNumber = left.number ?? Number.MAX_SAFE_INTEGER;
      const rightNumber = right.number ?? Number.MAX_SAFE_INTEGER;
      if (leftNumber !== rightNumber) return leftNumber - rightNumber;
      if (left.variant !== right.variant) return left.variant - right.variant;
      return left.filename.localeCompare(right.filename);
    });

    return normalized;
  } catch {
    return [];
  }
}

export function listSprites(paths: AppPaths): SpriteRecord[] {
  const indexed = loadSpriteIndex(paths);
  if (indexed.length > 0) {
    return indexed;
  }

  if (!fs.existsSync(paths.spritesDir)) {
    return [];
  }

  const sprites = fs
    .readdirSync(paths.spritesDir)
    .filter((filename) => SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase()))
    .map((filename) => buildSpriteEntry(filename));

  sprites.sort((left, right) => {
    const leftNumber = left.number ?? Number.MAX_SAFE_INTEGER;
    const rightNumber = right.number ?? Number.MAX_SAFE_INTEGER;
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    if (left.variant !== right.variant) return left.variant - right.variant;
    return left.filename.localeCompare(right.filename);
  });

  return sprites;
}

export function spriteLookup(paths: AppPaths): Map<string, SpriteRecord> {
  const lookup = new Map<string, SpriteRecord>();
  for (const sprite of listSprites(paths)) {
    for (const key of [sprite.id, sprite.filename, ...sprite.aliases]) {
      lookup.set(path.basename(key), sprite);
    }
  }
  return lookup;
}

function collectSpriteMatches(query: string, sprites: SpriteRecord[]): Array<{
  sprite: SpriteRecord;
  rank: [number, number, string] | [number, number, number, string];
  matchType: string;
}> {
  const normalizedQuery = normalizeSearchName(query);
  if (!normalizedQuery) {
    return [];
  }

  const matches: Array<{
    sprite: SpriteRecord;
    rank: [number, number, string] | [number, number, number, string];
    matchType: string;
  }> = [];

  for (const sprite of sprites) {
    const displayName = normalizeSearchName(sprite.displayName);
    const chineseName = normalizeSearchName(sprite.chineseName);
    const rawName = normalizeSearchName(sprite.name);
    const filename = normalizeSearchName(sprite.filename);
    const pathName = normalizeSearchName(path.basename(sprite.path));
    const stemName = normalizeSearchName(path.parse(sprite.path).name);
    const numberNames = spriteNumberAliases(sprite).map((alias) => normalizeSearchName(alias));
    const aliasNames = sprite.aliases.map((alias) => normalizeSearchName(alias));
    const exactNames = [displayName, chineseName, rawName, filename, pathName, stemName].filter(Boolean);

    let rank: [number, number, string] | [number, number, number, string] | null = null;
    let matchType = '';

    if (exactNames.includes(normalizedQuery)) {
      rank = [0, displayName.length, sprite.path];
      matchType = 'exact-name';
    } else if (numberNames.includes(normalizedQuery)) {
      rank = [1, sprite.variant || 0, sprite.path];
      matchType = 'exact-number';
    } else if (aliasNames.includes(normalizedQuery)) {
      rank = [2, normalizedQuery.length, sprite.path];
      matchType = 'exact-alias';
    } else if (pathName.includes(normalizedQuery)) {
      rank = [3, pathName.length, sprite.path];
      matchType = 'contains-path';
    } else if (displayName.startsWith(normalizedQuery)) {
      rank = [4, displayName.length, sprite.path];
      matchType = 'prefix-display-name';
    } else if (displayName.includes(normalizedQuery)) {
      rank = [5, displayName.indexOf(normalizedQuery), displayName.length, sprite.path];
      matchType = 'contains-display-name';
    } else {
      const aliasHit = aliasNames.find((alias) => alias.includes(normalizedQuery));
      if (aliasHit) {
        rank = [6, aliasHit.indexOf(normalizedQuery), aliasHit.length, sprite.path];
        matchType = 'contains-alias';
      }
    }

    if (rank) {
      matches.push({ sprite, rank, matchType });
    }
  }

  matches.sort((left, right) => {
    const leftRank = left.rank;
    const rightRank = right.rank;
    const length = Math.max(leftRank.length, rightRank.length);
    for (let index = 0; index < length; index += 1) {
      const leftValue = leftRank[index];
      const rightValue = rightRank[index];
      if (leftValue === rightValue) continue;
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return leftValue - rightValue;
      }
      return String(leftValue).localeCompare(String(rightValue));
    }
    return 0;
  });

  return matches;
}

export function spriteMatchesKeyword(sprite: SpriteRecord, keyword: string): boolean {
  const normalizedKeyword = normalizeSearchName(keyword);
  if (!normalizedKeyword) {
    return true;
  }
  return collectSpriteMatches(normalizedKeyword, [sprite]).length > 0;
}

function buildQuickFillCandidates(
  query: string,
  bestMatch: SpriteRecord,
  sprites: SpriteRecord[],
  rankedMatches: ReturnType<typeof collectSpriteMatches>,
): SpriteRecord[] {
  const variantGroup = spriteVariantGroup(bestMatch);
  if (!variantGroup) {
    return [bestMatch];
  }

  const family = sprites.filter((sprite) => spriteVariantGroup(sprite) === variantGroup);
  if (family.length <= 1) {
    return [bestMatch];
  }

  const rankedLookup = new Map(rankedMatches.map((item) => [item.sprite.path, item.rank]));
  const normalizedQuery = normalizeSearchName(query);

  return [...family].sort((left, right) => {
    const leftRank = rankedLookup.get(left.path);
    const rightRank = rankedLookup.get(right.path);
    if (left.path === bestMatch.path) return -1;
    if (right.path === bestMatch.path) return 1;
    if (leftRank && rightRank) return String(leftRank).localeCompare(String(rightRank));
    if (leftRank) return -1;
    if (rightRank) return 1;

    const leftRelated = [left.displayName, left.filename, variantGroup].some((value) =>
      normalizeSearchName(value).includes(normalizedQuery),
    );
    const rightRelated = [right.displayName, right.filename, variantGroup].some((value) =>
      normalizeSearchName(value).includes(normalizedQuery),
    );
    if (leftRelated !== rightRelated) return leftRelated ? -1 : 1;
    return left.path.localeCompare(right.path);
  });
}

export function buildQuickFillPreview(paths: AppPaths, text: string): QuickFillPreview {
  if (typeof text !== 'string') {
    throw new Error('text must be a string');
  }

  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const acceptedLines = lines.slice(0, MAX_SELECTION_COUNT);
  const ignoredCount = Math.max(0, lines.length - MAX_SELECTION_COUNT);
  const sprites = listSprites(paths);

  const matches = acceptedLines.map((input, index) => {
    const rankedMatches = collectSpriteMatches(input, sprites);
    const matched = rankedMatches[0];

    return {
      slot: index,
      input,
      matched: Boolean(matched),
      matchType: matched?.matchType ?? null,
      sprite: matched?.sprite ?? null,
      candidates: matched ? buildQuickFillCandidates(input, matched.sprite, sprites, rankedMatches) : [],
    };
  });

  return {
    matches,
    acceptedCount: acceptedLines.length,
    matchedCount: matches.filter((item) => item.matched).length,
    ignoredCount,
    unmatched: matches.filter((item) => !item.matched).map((item) => item.input),
  };
}

import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_BEST_OF,
  DEFAULT_CENTER_AREA_COLOR,
  DEFAULT_ENERGY_VALUE,
  DEFAULT_EVENT_TITLE,
  DEFAULT_HEALTH_PERCENT,
  DEFAULT_OPACITY,
  DEFAULT_SATURATION,
  MAX_SELECTION_COUNT,
  SUPPORTED_BEST_OF,
} from '../../shared/constants.js';
import type { PanelState, ScoreboardState, SlotState } from '../../shared/types.js';
import { spriteLookup } from './sprite-service.js';
import type { AppPaths } from './path-service.js';
import { ensureRuntimeDirs } from './image-service.js';

function normalizeOpacity(value: unknown): number {
  const opacity = Number(value);
  if (Number.isNaN(opacity)) return DEFAULT_OPACITY;
  return Math.min(1, Math.max(0, opacity));
}

function normalizeSaturation(value: unknown): number {
  const saturation = Number(value);
  if (Number.isNaN(saturation)) return DEFAULT_SATURATION;
  return Math.min(3, Math.max(0, saturation));
}

function normalizeHealthPercent(value: unknown): number {
  const health = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(health)) return DEFAULT_HEALTH_PERCENT;
  return Math.min(100, Math.max(0, health));
}

function normalizeEnergyValue(value: unknown): number {
  const energy = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(energy)) return DEFAULT_ENERGY_VALUE;
  return Math.min(10, Math.max(0, energy));
}

function normalizeScoreboardText(value: unknown, maxLength = 32): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeScoreboardScore(value: unknown, maxLength = 4): string {
  const text = String(value ?? '').trim();
  return (text || '0').slice(0, maxLength);
}

function normalizeBestOf(value: unknown): number {
  const bestOf = Number.parseInt(String(value ?? ''), 10);
  return SUPPORTED_BEST_OF.has(bestOf) ? bestOf : DEFAULT_BEST_OF;
}

function normalizeFontSize(value: unknown, defaultValue = 64, minimum = 12, maximum = 160): number {
  const size = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(size)) return defaultValue;
  return Math.min(maximum, Math.max(minimum, size));
}

function normalizePage2LineupDisplayMode(value: unknown): 'default' | 'avatar-only' {
  return value === 'avatar-only' ? 'avatar-only' : 'default';
}

function normalizeBool(value: unknown, defaultValue = true): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(lowered)) return true;
    if (['false', '0', 'no', 'off'].includes(lowered)) return false;
  }
  return defaultValue;
}

function normalizeHexColor(value: unknown, defaultValue = DEFAULT_CENTER_AREA_COLOR): string {
  if (typeof value !== 'string') return defaultValue;
  const text = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text.toUpperCase();
  }
  return defaultValue;
}

function defaultSlot(index: number): SlotState {
  return {
    slot: index,
    sprite: null,
    opacityEnabled: false,
    opacity: DEFAULT_OPACITY,
    effectiveOpacity: 1,
    saturation: DEFAULT_SATURATION,
    healthEnabled: true,
    healthPercent: DEFAULT_HEALTH_PERCENT,
    energyValue: DEFAULT_ENERGY_VALUE,
  };
}

function defaultPanelState(position: 'left' | 'right'): PanelState {
  return {
    position,
    count: 0,
    selected: Array.from({ length: MAX_SELECTION_COUNT }, (_, index) => defaultSlot(index)),
    mtime: null,
  };
}

function serializeSlotState(slot: SlotState) {
  return {
    slot: slot.slot,
    sprite: slot.sprite,
    opacityEnabled: slot.opacityEnabled,
    opacity: slot.opacity,
    saturation: slot.saturation,
    healthEnabled: slot.healthEnabled,
    healthPercent: slot.healthPercent,
    energyValue: slot.energyValue,
  };
}

function parseSlotStateInput(paths: AppPaths, index: number, item: unknown): SlotState {
  const slot = defaultSlot(index);
  if (item === null || item === undefined) {
    return slot;
  }
  if (!item || typeof item !== 'object') {
    throw new Error('slot must be an object or null');
  }

  const lookup = spriteLookup(paths);
  const raw = item as Record<string, unknown>;
  const rawSprite = raw.sprite;
  const spriteId =
    rawSprite && typeof rawSprite === 'object' && typeof (rawSprite as Record<string, unknown>).id === 'string'
      ? (rawSprite as Record<string, unknown>).id
      : rawSprite;

  slot.opacityEnabled = Boolean(raw.opacityEnabled);
  slot.opacity = normalizeOpacity(raw.opacity);
  slot.saturation = normalizeSaturation(raw.saturation);
  slot.healthEnabled =
    typeof raw.healthEnabled === 'boolean' ? raw.healthEnabled : Boolean(raw.protectionEnabled);
  slot.healthPercent = normalizeHealthPercent(raw.healthPercent ?? raw.protectionPercent);
  slot.energyValue = normalizeEnergyValue(raw.energyValue);

  if (spriteId !== null && spriteId !== undefined) {
    if (typeof spriteId !== 'string') {
      throw new Error('sprite id must be a string or null');
    }
    const normalizedName = path.basename(spriteId);
    const sprite = lookup.get(normalizedName);
    if (!sprite) {
      throw new Error(`Sprite not found: ${normalizedName}`);
    }
    slot.sprite = sprite;
  }

  slot.effectiveOpacity = slot.opacityEnabled ? slot.opacity : 1;
  return slot;
}

function defaultScoreboardState(): ScoreboardState {
  return {
    leftName: '',
    leftScore: '0',
    rightName: '',
    rightScore: '0',
    bestOf: DEFAULT_BEST_OF,
    scoreboardEnabled: true,
    healthBadgeEnabled: true,
    abilityBadgeEnabled: true,
    eventTitle: DEFAULT_EVENT_TITLE,
    eventTitleEnabled: true,
    page2LineupDisplayMode: 'default',
    nameFontSize: 64,
    scoreFontSize: 64,
    centerAreaEnabled: true,
    centerAreaColor: DEFAULT_CENTER_AREA_COLOR,
    mtime: null,
  };
}

function hydrateSelected(paths: AppPaths, rawSelected: unknown[]): SlotState[] {
  const lookup = spriteLookup(paths);
  const hydrated: SlotState[] = [];

  rawSelected.slice(0, MAX_SELECTION_COUNT).forEach((item, index) => {
    const slot = defaultSlot(index);

    if (!item || typeof item !== 'object') {
      hydrated.push(slot);
      return;
    }

    const raw = item as Record<string, unknown>;
    const rawSprite = raw.sprite;
    const spriteId =
      rawSprite && typeof rawSprite === 'object' && typeof (rawSprite as Record<string, unknown>).id === 'string'
        ? (rawSprite as Record<string, unknown>).id
        : rawSprite;

    slot.opacityEnabled = Boolean(raw.opacityEnabled);
    slot.opacity = normalizeOpacity(raw.opacity);
    slot.saturation = normalizeSaturation(raw.saturation);
    slot.healthEnabled =
      typeof raw.healthEnabled === 'boolean'
        ? raw.healthEnabled
        : typeof raw.protectionEnabled === 'boolean'
          ? raw.protectionEnabled
          : !slot.opacityEnabled;
    slot.healthPercent = normalizeHealthPercent(raw.healthPercent ?? raw.protectionPercent);
    slot.energyValue = normalizeEnergyValue(raw.energyValue);

    if (typeof spriteId === 'string') {
      const normalizedName = path.basename(spriteId);
      slot.sprite = lookup.get(normalizedName) ?? null;
    }

    slot.effectiveOpacity = slot.opacityEnabled ? slot.opacity : 1;
    hydrated.push(slot);
  });

  while (hydrated.length < MAX_SELECTION_COUNT) {
    hydrated.push(defaultSlot(hydrated.length));
  }

  return hydrated;
}

export function getPanelState(paths: AppPaths, position: 'left' | 'right'): PanelState {
  const state = defaultPanelState(position);
  const panelPath = paths.panelStatePath(position);

  if (!fs.existsSync(panelPath)) {
    return state;
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(panelPath, 'utf-8')) as { selected?: unknown[] };
    const selected = hydrateSelected(paths, Array.isArray(metadata.selected) ? metadata.selected : []);
    const stat = fs.statSync(panelPath);

    return {
      position,
      count: selected.filter((item) => item.sprite).length,
      selected,
      mtime: stat.mtimeMs,
    };
  } catch {
    return state;
  }
}

export function getScoreboardState(paths: AppPaths): ScoreboardState {
  const state = defaultScoreboardState();
  if (!fs.existsSync(paths.scoreboardFile)) {
    return state;
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(paths.scoreboardFile, 'utf-8')) as Record<string, unknown>;
    const stat = fs.statSync(paths.scoreboardFile);

    return {
      leftName: normalizeScoreboardText(metadata.leftName),
      leftScore: normalizeScoreboardScore(metadata.leftScore),
      rightName: normalizeScoreboardText(metadata.rightName),
      rightScore: normalizeScoreboardScore(metadata.rightScore),
      bestOf: normalizeBestOf(metadata.bestOf),
      scoreboardEnabled: normalizeBool(metadata.scoreboardEnabled, true),
      healthBadgeEnabled: normalizeBool(metadata.healthBadgeEnabled, true),
      abilityBadgeEnabled: normalizeBool(metadata.abilityBadgeEnabled, true),
      eventTitle: normalizeScoreboardText(metadata.eventTitle ?? DEFAULT_EVENT_TITLE, 40),
      eventTitleEnabled: normalizeBool(metadata.eventTitleEnabled, true),
      page2LineupDisplayMode: normalizePage2LineupDisplayMode(metadata.page2LineupDisplayMode),
      nameFontSize: normalizeFontSize(metadata.nameFontSize, 64),
      scoreFontSize: normalizeFontSize(metadata.scoreFontSize, 64),
      centerAreaEnabled: normalizeBool(metadata.centerAreaEnabled, true),
      centerAreaColor: normalizeHexColor(metadata.centerAreaColor, DEFAULT_CENTER_AREA_COLOR),
      mtime: stat.mtimeMs,
    };
  } catch {
    return state;
  }
}

export function saveScoreboardState(paths: AppPaths, payload: unknown): ScoreboardState {
  if (!payload || typeof payload !== 'object') {
    throw new Error('scoreboard payload must be an object');
  }

  const raw = payload as Record<string, unknown>;
  ensureRuntimeDirs(paths);

  const metadata = {
    leftName: normalizeScoreboardText(raw.leftName),
    leftScore: normalizeScoreboardScore(raw.leftScore),
    rightName: normalizeScoreboardText(raw.rightName),
    rightScore: normalizeScoreboardScore(raw.rightScore),
    bestOf: normalizeBestOf(raw.bestOf),
    scoreboardEnabled: normalizeBool(raw.scoreboardEnabled, true),
    healthBadgeEnabled: normalizeBool(raw.healthBadgeEnabled, true),
    abilityBadgeEnabled: normalizeBool(raw.abilityBadgeEnabled, true),
    eventTitle: normalizeScoreboardText(raw.eventTitle ?? DEFAULT_EVENT_TITLE, 40),
    eventTitleEnabled: normalizeBool(raw.eventTitleEnabled, true),
    page2LineupDisplayMode: normalizePage2LineupDisplayMode(raw.page2LineupDisplayMode),
    nameFontSize: normalizeFontSize(raw.nameFontSize, 64),
    scoreFontSize: normalizeFontSize(raw.scoreFontSize, 64),
    centerAreaEnabled: normalizeBool(raw.centerAreaEnabled, true),
    centerAreaColor: normalizeHexColor(raw.centerAreaColor, DEFAULT_CENTER_AREA_COLOR),
  };

  fs.writeFileSync(paths.scoreboardFile, JSON.stringify(metadata, null, 2), 'utf-8');
  return getScoreboardState(paths);
}

export function saveScoreboardBestOf(paths: AppPaths, payload: unknown): ScoreboardState {
  if (!payload || typeof payload !== 'object') {
    throw new Error('best-of payload must be an object');
  }

  const current = getScoreboardState(paths);
  const raw = payload as Record<string, unknown>;
  return saveScoreboardState(paths, { ...current, bestOf: normalizeBestOf(raw.bestOf) });
}

export function savePanelState(paths: AppPaths, position: 'left' | 'right', selectedSlots: unknown): PanelState {
  if (!Array.isArray(selectedSlots)) {
    throw new Error('selected must be a list');
  }
  if (selectedSlots.length > MAX_SELECTION_COUNT) {
    throw new Error('Too many slots provided');
  }

  ensureRuntimeDirs(paths);
  const selected: SlotState[] = [];

  selectedSlots.slice(0, MAX_SELECTION_COUNT).forEach((item, index) => {
    selected.push(parseSlotStateInput(paths, index, item));
  });

  while (selected.length < MAX_SELECTION_COUNT) {
    selected.push(defaultSlot(selected.length));
  }

  const metadata = {
    position,
    selected: selected.map(serializeSlotState),
  };

  fs.writeFileSync(paths.panelStatePath(position), JSON.stringify(metadata, null, 2), 'utf-8');
  return getPanelState(paths, position);
}

export function savePanelSlotState(
  paths: AppPaths,
  position: 'left' | 'right',
  slotIndex: number,
  slotData: unknown,
): PanelState {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_SELECTION_COUNT) {
    throw new Error('invalid slot index');
  }

  ensureRuntimeDirs(paths);
  const current = getPanelState(paths, position);
  const selected = current.selected.slice(0, MAX_SELECTION_COUNT);
  while (selected.length < MAX_SELECTION_COUNT) {
    selected.push(defaultSlot(selected.length));
  }

  selected[slotIndex] = parseSlotStateInput(paths, slotIndex, slotData);

  const metadata = {
    position,
    selected: selected.map(serializeSlotState),
  };

  fs.writeFileSync(paths.panelStatePath(position), JSON.stringify(metadata, null, 2), 'utf-8');
  return getPanelState(paths, position);
}

export function clearPanelState(paths: AppPaths, position: 'left' | 'right'): void {
  const panelPath = paths.panelStatePath(position);
  if (fs.existsSync(panelPath)) {
    fs.unlinkSync(panelPath);
  }
}

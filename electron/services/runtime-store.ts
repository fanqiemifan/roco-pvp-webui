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
import type { PanelState, ScoreboardState, SlotState, SnapshotPayload, SpriteRecord } from '../../shared/types.js';
import { deleteBackground as deleteBackgroundFile, getBackgroundState, saveBackground as saveBackgroundFile } from './image-service.js';
import type { AppPaths } from './path-service.js';
import { getPanelState, getScoreboardState, savePanelState, saveScoreboardState } from './state-service.js';
import { listSprites, spriteMatchesKeyword } from './sprite-service.js';

type PanelPosition = 'left' | 'right';

function createSpriteLookup(sprites: SpriteRecord[]): Map<string, SpriteRecord> {
  const lookup = new Map<string, SpriteRecord>();
  for (const sprite of sprites) {
    for (const key of [sprite.id, sprite.filename, ...sprite.aliases]) {
      lookup.set(path.basename(String(key)), sprite);
    }
  }
  return lookup;
}

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

function defaultPanelState(position: PanelPosition): PanelState {
  return {
    position,
    count: 0,
    selected: Array.from({ length: MAX_SELECTION_COUNT }, (_, index) => defaultSlot(index)),
    mtime: null,
  };
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
    nameFontSize: 64,
    scoreFontSize: 64,
    centerAreaEnabled: true,
    centerAreaColor: DEFAULT_CENTER_AREA_COLOR,
    mtime: null,
  };
}

function normalizeSelectedSlots(
  selectedSlots: unknown,
  lookup: Map<string, SpriteRecord>,
  position: PanelPosition,
): PanelState {
  if (!Array.isArray(selectedSlots)) {
    throw new Error('selected must be a list');
  }
  if (selectedSlots.length > MAX_SELECTION_COUNT) {
    throw new Error('Too many slots provided');
  }

  const selected: SlotState[] = [];
  selectedSlots.slice(0, MAX_SELECTION_COUNT).forEach((item, index) => {
    const slot = defaultSlot(index);

    if (item === null) {
      selected.push(slot);
      return;
    }

    if (!item || typeof item !== 'object') {
      throw new Error('slot must be an object or null');
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
    selected.push(slot);
  });

  while (selected.length < MAX_SELECTION_COUNT) {
    selected.push(defaultSlot(selected.length));
  }

  return {
    position,
    count: selected.filter((item) => item.sprite).length,
    selected,
    mtime: Date.now(),
  };
}

function normalizeScoreboardState(payload: unknown, current: ScoreboardState): ScoreboardState {
  if (!payload || typeof payload !== 'object') {
    throw new Error('scoreboard payload must be an object');
  }

  const raw = payload as Record<string, unknown>;
  return {
    leftName: normalizeScoreboardText(raw.leftName ?? current.leftName),
    leftScore: normalizeScoreboardScore(raw.leftScore ?? current.leftScore),
    rightName: normalizeScoreboardText(raw.rightName ?? current.rightName),
    rightScore: normalizeScoreboardScore(raw.rightScore ?? current.rightScore),
    bestOf: normalizeBestOf(raw.bestOf ?? current.bestOf),
    scoreboardEnabled: normalizeBool(raw.scoreboardEnabled, current.scoreboardEnabled),
    healthBadgeEnabled: normalizeBool(raw.healthBadgeEnabled, current.healthBadgeEnabled),
    abilityBadgeEnabled: normalizeBool(raw.abilityBadgeEnabled, current.abilityBadgeEnabled),
    eventTitle: normalizeScoreboardText(raw.eventTitle ?? current.eventTitle ?? DEFAULT_EVENT_TITLE, 40),
    eventTitleEnabled: normalizeBool(raw.eventTitleEnabled, current.eventTitleEnabled),
    nameFontSize: normalizeFontSize(raw.nameFontSize ?? current.nameFontSize, current.nameFontSize),
    scoreFontSize: normalizeFontSize(raw.scoreFontSize ?? current.scoreFontSize, current.scoreFontSize),
    centerAreaEnabled: normalizeBool(raw.centerAreaEnabled, current.centerAreaEnabled),
    centerAreaColor: normalizeHexColor(raw.centerAreaColor ?? current.centerAreaColor, current.centerAreaColor),
    mtime: Date.now(),
  };
}

export interface RuntimeStore {
  snapshot(): SnapshotPayload;
  getPanel(position: PanelPosition): PanelState;
  setPanel(position: PanelPosition, selectedSlots: unknown): PanelState;
  patchPanelSlot(position: PanelPosition, slotIndex: number, payload: unknown): SlotState;
  clearPanel(position: PanelPosition): PanelState;
  getScoreboard(): ScoreboardState;
  setScoreboard(payload: unknown): ScoreboardState;
  setScoreboardBestOf(payload: unknown): ScoreboardState;
  getBackground(): SnapshotPayload['background'];
  saveBackground(buffer: Buffer): SnapshotPayload['background'];
  deleteBackground(): SnapshotPayload['background'];
  listSprites(keyword?: string): SpriteRecord[];
  close(): Promise<void>;
}

export function createRuntimeStore(paths: AppPaths, flushDelayMs = 150): RuntimeStore {
  const sprites = listSprites(paths);
  const lookup = createSpriteLookup(sprites);
  const panels: Record<PanelPosition, PanelState> = {
    left: getPanelState(paths, 'left'),
    right: getPanelState(paths, 'right'),
  };
  let scoreboard = getScoreboardState(paths);
  let background = getBackgroundState(paths);
  let flushTimer: NodeJS.Timeout | null = null;
  const dirtyPanels = new Set<PanelPosition>();
  let dirtyScoreboard = false;

  function scheduleFlush(): void {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, flushDelayMs);
  }

  async function flush(): Promise<void> {
    const panelPositions = [...dirtyPanels];
    const shouldFlushScoreboard = dirtyScoreboard;

    dirtyPanels.clear();
    dirtyScoreboard = false;

    for (const position of panelPositions) {
      savePanelState(paths, position, panels[position].selected);
    }

    if (shouldFlushScoreboard) {
      saveScoreboardState(paths, scoreboard);
    }
  }

  function assertPanel(position: string): asserts position is PanelPosition {
    if (position !== 'left' && position !== 'right') {
      throw new Error('Invalid position');
    }
  }

  function markPanelDirty(position: PanelPosition): void {
    dirtyPanels.add(position);
    scheduleFlush();
  }

  return {
    snapshot() {
      return {
        panels: [panels.left, panels.right],
        scoreboard,
        background,
      };
    },

    getPanel(position) {
      return panels[position];
    },

    setPanel(position, selectedSlots) {
      assertPanel(position);
      panels[position] = normalizeSelectedSlots(selectedSlots, lookup, position);
      markPanelDirty(position);
      return panels[position];
    },

    patchPanelSlot(position, slotIndex, payload) {
      assertPanel(position);
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_SELECTION_COUNT) {
        throw new Error('Invalid slot index');
      }
      if (!payload || typeof payload !== 'object') {
        throw new Error('slot payload must be an object');
      }

      const raw = payload as Record<string, unknown>;
      const currentPanel = panels[position] ?? defaultPanelState(position);
      const nextSelected = currentPanel.selected.map((slot) => ({ ...slot }));
      const currentSlot = nextSelected[slotIndex] ?? defaultSlot(slotIndex);
      const nextSlot: SlotState = {
        ...currentSlot,
        slot: slotIndex,
        healthPercent:
          raw.healthPercent === undefined ? currentSlot.healthPercent : normalizeHealthPercent(raw.healthPercent),
        energyValue: raw.energyValue === undefined ? currentSlot.energyValue : normalizeEnergyValue(raw.energyValue),
      };

      nextSelected[slotIndex] = nextSlot;
      panels[position] = {
        position,
        count: nextSelected.filter((item) => item.sprite).length,
        selected: nextSelected,
        mtime: Date.now(),
      };
      markPanelDirty(position);
      return nextSlot;
    },

    clearPanel(position) {
      assertPanel(position);
      panels[position] = {
        ...defaultPanelState(position),
        mtime: Date.now(),
      };
      markPanelDirty(position);
      return panels[position];
    },

    getScoreboard() {
      return scoreboard;
    },

    setScoreboard(payload) {
      scoreboard = normalizeScoreboardState(payload, scoreboard || defaultScoreboardState());
      dirtyScoreboard = true;
      scheduleFlush();
      return scoreboard;
    },

    setScoreboardBestOf(payload) {
      if (!payload || typeof payload !== 'object') {
        throw new Error('best-of payload must be an object');
      }
      const raw = payload as Record<string, unknown>;
      scoreboard = normalizeScoreboardState({ ...scoreboard, bestOf: raw.bestOf }, scoreboard);
      dirtyScoreboard = true;
      scheduleFlush();
      return scoreboard;
    },

    getBackground() {
      return background;
    },

    saveBackground(buffer) {
      background = saveBackgroundFile(paths, buffer);
      return background;
    },

    deleteBackground() {
      background = deleteBackgroundFile(paths);
      return background;
    },

    listSprites(keyword = '') {
      if (!keyword) {
        return sprites;
      }
      return sprites.filter((sprite) => spriteMatchesKeyword(sprite, keyword));
    },

    async close() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flush();
    },
  };
}

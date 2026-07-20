import fs from 'node:fs';
import path from 'node:path';

import type { Page4PanelState, Page4SlotState, Page4State, SpriteRecord } from '../../shared/types.js';
import type { AppPaths } from './path-service.js';
import { ensureRuntimeDirs } from './image-service.js';
import { spriteLookup } from './sprite-service.js';

const MAX_PAGE4_SLOTS = 6;

interface Page4StoredSlot {
  slot: number;
  spriteId: string | null;
  isDead: boolean;
}

interface Page4StoredPanel {
  selected: Page4StoredSlot[];
}

interface Page4StoreFile {
  left: Page4StoredPanel;
  right: Page4StoredPanel;
}

function defaultStoredSlot(index: number): Page4StoredSlot {
  return {
    slot: index,
    spriteId: null,
    isDead: false,
  };
}

function defaultStoredPanel(): Page4StoredPanel {
  return {
    selected: Array.from({ length: MAX_PAGE4_SLOTS }, (_, index) => defaultStoredSlot(index)),
  };
}

function defaultStoreFile(): Page4StoreFile {
  return {
    left: defaultStoredPanel(),
    right: defaultStoredPanel(),
  };
}

function normalizeStoredSpriteId(value: unknown, lookup?: Map<string, SpriteRecord>): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const rawValue = value.trim();
  if (!lookup) {
    return rawValue;
  }

  const sprite = lookup.get(rawValue) ?? lookup.get(path.basename(rawValue));
  const displayName = typeof sprite?.displayName === 'string' ? sprite.displayName.trim() : '';
  return displayName || rawValue;
}

function normalizeStoredSlot(item: unknown, index: number, lookup?: Map<string, SpriteRecord>): Page4StoredSlot {
  const slot = defaultStoredSlot(index);
  if (!item || typeof item !== 'object') {
    return slot;
  }

  const raw = item as Record<string, unknown>;
  const rawSprite = raw.sprite;
  const spriteId =
    typeof raw.spriteId === 'string'
      ? raw.spriteId
      : rawSprite && typeof rawSprite === 'object' && typeof (rawSprite as Record<string, unknown>).id === 'string'
        ? (rawSprite as Record<string, unknown>).id
        : rawSprite;

  slot.isDead = typeof raw.isDead === 'boolean' ? raw.isDead : Boolean(raw.dead);

  if (spriteId !== null && spriteId !== undefined) {
    if (typeof spriteId !== 'string') {
      throw new Error('sprite id must be a string or null');
    }
    const normalizedName = path.basename(spriteId);
    const sprite = lookup?.get(normalizedName);
    if (!sprite) {
      throw new Error(`Sprite not found: ${normalizedName}`);
    }
    slot.spriteId = sprite.displayName?.trim() || normalizedName;
  }

  return slot;
}

function normalizeStoredPanel(selected: unknown, lookup?: Map<string, SpriteRecord>): Page4StoredPanel {
  const nextSelected = Array.from({ length: MAX_PAGE4_SLOTS }, (_, index) => defaultStoredSlot(index));
  if (!Array.isArray(selected)) {
    return { selected: nextSelected };
  }

  selected.slice(0, MAX_PAGE4_SLOTS).forEach((item, index) => {
    nextSelected[index] = normalizeStoredSlot(item, index, lookup);
  });

  return { selected: nextSelected };
}

function readStoreFile(paths: AppPaths): { store: Page4StoreFile; mtime: number | null } {
  const page4Path = paths.page4File;
  if (!fs.existsSync(page4Path)) {
    return { store: defaultStoreFile(), mtime: null };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(page4Path, 'utf-8')) as Partial<Page4StoreFile>;
    const lookup = spriteLookup(paths);
    const store: Page4StoreFile = {
      left: normalizeStoredPanel(raw.left?.selected, lookup),
      right: normalizeStoredPanel(raw.right?.selected, lookup),
    };
    return {
      store,
      mtime: fs.statSync(page4Path).mtimeMs,
    };
  } catch {
    return { store: defaultStoreFile(), mtime: null };
  }
}

function writeStoreFile(paths: AppPaths, store: Page4StoreFile): { store: Page4StoreFile; mtime: number | null } {
  ensureRuntimeDirs(paths);
  fs.writeFileSync(paths.page4File, JSON.stringify(store, null, 2), 'utf-8');
  return readStoreFile(paths);
}

function hydrateSlot(slot: Page4StoredSlot, lookup: Map<string, SpriteRecord>): Page4SlotState {
  return {
    slot: slot.slot,
    sprite: slot.spriteId ? (lookup.get(slot.spriteId) ?? lookup.get(path.basename(slot.spriteId)) ?? null) : null,
    isDead: Boolean(slot.isDead),
  };
}

function hydratePanel(position: 'left' | 'right', panel: Page4StoredPanel, lookup: Map<string, SpriteRecord>, mtime: number | null): Page4PanelState {
  const selected = panel.selected.slice(0, MAX_PAGE4_SLOTS).map((slot, index) => hydrateSlot({
    slot: index,
    spriteId: slot.spriteId,
    isDead: slot.isDead,
  }, lookup));

  while (selected.length < MAX_PAGE4_SLOTS) {
    selected.push({
      slot: selected.length,
      sprite: null,
      isDead: false,
    });
  }

  return {
    position,
    count: selected.filter((item) => item.sprite).length,
    selected,
    mtime,
  };
}

function getCurrentStore(paths: AppPaths): Page4StoreFile {
  return readStoreFile(paths).store;
}

function normalizeSelectedSlots(paths: AppPaths, selectedSlots: unknown): Page4StoredSlot[] {
  if (!Array.isArray(selectedSlots)) {
    throw new Error('selected must be a list');
  }

  const lookup = spriteLookup(paths);
  const nextSlots = Array.from({ length: MAX_PAGE4_SLOTS }, (_, index) => defaultStoredSlot(index));

  selectedSlots.slice(0, MAX_PAGE4_SLOTS).forEach((item, index) => {
    nextSlots[index] = normalizeStoredSlot(item, index, lookup);
  });

  return nextSlots;
}

function normalizeSelectedSlot(paths: AppPaths, slotIndex: number, slotData: unknown): Page4StoredSlot {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_PAGE4_SLOTS) {
    throw new Error('invalid slot index');
  }

  const nextSlots = normalizeSelectedSlots(
    paths,
    Array.from({ length: MAX_PAGE4_SLOTS }, (_, index) => (index === slotIndex ? slotData : null)),
  );
  return nextSlots[slotIndex];
}

export function getPage4State(paths: AppPaths): Page4State {
  const { store, mtime } = readStoreFile(paths);
  const lookup = spriteLookup(paths);

  return {
    panels: [
      hydratePanel('left', store.left, lookup, mtime),
      hydratePanel('right', store.right, lookup, mtime),
    ],
    mtime,
  };
}

export function savePage4State(paths: AppPaths, position: 'left' | 'right', selectedSlots: unknown): Page4PanelState {
  const { store } = readStoreFile(paths);
  store[position] = { selected: normalizeSelectedSlots(paths, selectedSlots) };
  return hydratePanel(position, writeStoreFile(paths, store).store[position], spriteLookup(paths), fs.existsSync(paths.page4File) ? fs.statSync(paths.page4File).mtimeMs : null);
}

export function savePage4SlotState(
  paths: AppPaths,
  position: 'left' | 'right',
  slotIndex: number,
  slotData: unknown,
): Page4PanelState {
  const { store } = readStoreFile(paths);
  const nextSlot = normalizeSelectedSlot(paths, slotIndex, slotData);
  const nextSelected = store[position].selected.slice(0, MAX_PAGE4_SLOTS);

  while (nextSelected.length < MAX_PAGE4_SLOTS) {
    nextSelected.push(defaultStoredSlot(nextSelected.length));
  }

  nextSelected[slotIndex] = nextSlot;
  store[position] = { selected: nextSelected };

  const nextStore = writeStoreFile(paths, store);
  return hydratePanel(position, nextStore.store[position], spriteLookup(paths), nextStore.mtime);
}

export function clearPage4State(paths: AppPaths, position: 'left' | 'right'): Page4PanelState {
  const { store } = readStoreFile(paths);
  store[position] = defaultStoredPanel();
  const nextStore = writeStoreFile(paths, store);
  return hydratePanel(position, nextStore.store[position], spriteLookup(paths), nextStore.mtime);
}

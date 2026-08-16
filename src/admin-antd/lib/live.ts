import type { SlotState } from '../../../shared/types';
import type { LiveConfigPayload, PanelEditorState, PanelSide } from '../types';
import { cleanSpriteName } from './format';
import { getSlotName } from './sprite';

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getHealthLevel(slot: SlotState | null | undefined): number {
  if (!slot || !slot.healthEnabled || typeof slot.healthPercent !== 'number') {
    return 100;
  }
  return clampNumber(slot.healthPercent, 0, 100);
}

export function getEnergyLevel(slot: SlotState | null | undefined): number {
  if (!slot || typeof slot.energyValue !== 'number') {
    return 10;
  }
  return clampNumber(Math.round(slot.energyValue), 0, 10);
}

export function buildLiveConfigPayload(panels: Record<PanelSide, PanelEditorState>): LiveConfigPayload {
  const mapSlot = (slot: SlotState) => ({
    name: getSlotName(slot),
    HP: clampNumber(Math.round(Number(slot.healthPercent) || 0), 0, 100),
    value: clampNumber(Math.round(Number(slot.energyValue) || 0), 0, 10),
  });

  return {
    left: panels.left.selected.filter((slot) => slot.sprite).map(mapSlot),
    right: panels.right.selected.filter((slot) => slot.sprite).map(mapSlot),
  };
}

export function stringifyLiveConfig(panels: Record<PanelSide, PanelEditorState>): string {
  return JSON.stringify(buildLiveConfigPayload(panels), null, 2);
}

export function extractLiveConfigPanel(payload: Record<string, unknown>, panel: PanelSide) {
  const direct = payload[panel];
  if (Array.isArray(direct)) {
    return direct;
  }
  if (direct && typeof direct === 'object' && Array.isArray((direct as { selected?: unknown[] }).selected)) {
    return (direct as { selected: unknown[] }).selected;
  }
  const panels = payload.panels;
  if (panels && typeof panels === 'object') {
    const nested = (panels as Record<string, unknown>)[panel];
    if (Array.isArray(nested)) {
      return nested;
    }
  }
  return null;
}

export function readNumberField(item: Record<string, unknown>, names: string[], min: number, max: number) {
  for (const name of names) {
    const value = item[name];
    if (value !== undefined && value !== null && value !== '') {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        return clampNumber(Math.round(numeric), min, max);
      }
    }
  }
  return null;
}

export function findConfigTargetIndex(
  panel: PanelSide,
  item: Record<string, unknown>,
  fallbackIndex: number,
  usedIndexes: Set<number>,
  panels: Record<PanelSide, PanelEditorState>,
) {
  const expectedName = cleanSpriteName(typeof item.name === 'string' ? item.name : '');
  if (expectedName) {
    const matchIndex = panels[panel].selected.findIndex((slot, index) => {
      return !usedIndexes.has(index) && getSlotName(slot) === expectedName;
    });
    if (matchIndex >= 0) {
      return matchIndex;
    }
  }
  return fallbackIndex;
}

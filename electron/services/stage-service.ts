import fs from 'node:fs';

import {
  DEFAULT_STAGE_PAGE,
  DEFAULT_STAGE_TRANSITION,
  SUPPORTED_STAGE_PAGES,
  SUPPORTED_STAGE_TRANSITIONS,
} from '../../shared/constants.js';
import type { Page5RangeKey, StageConfig, StagePageKey, StageTransitionType } from '../../shared/types.js';
import { ensureRuntimeDirs } from './image-service.js';
import type { AppPaths } from './path-service.js';

const SUPPORTED_PAGE5_RANGES = new Set(['today', '7d', '30d', 'all']);

function normalizeStagePage(value: unknown): StagePageKey {
  if (typeof value === 'string' && SUPPORTED_STAGE_PAGES.has(value)) {
    return value as StagePageKey;
  }
  return DEFAULT_STAGE_PAGE as StagePageKey;
}

function normalizeStageTransition(value: unknown): StageTransitionType {
  if (typeof value === 'string' && SUPPORTED_STAGE_TRANSITIONS.has(value)) {
    return value as StageTransitionType;
  }
  return DEFAULT_STAGE_TRANSITION as StageTransitionType;
}

function normalizePage5Range(value: unknown): Page5RangeKey {
  if (typeof value === 'string' && SUPPORTED_PAGE5_RANGES.has(value)) {
    return value as Page5RangeKey;
  }
  return 'all';
}

function normalizePage5Tag(value: unknown): string {
  return String(value ?? '').trim().slice(0, 40);
}

function defaultStageState(): StageConfig {
  return {
    page: DEFAULT_STAGE_PAGE as StagePageKey,
    transition: DEFAULT_STAGE_TRANSITION as StageTransitionType,
    page5Range: 'all',
    page5Tag: '',
    mtime: null,
  };
}

export function getStageState(paths: AppPaths): StageConfig {
  if (!fs.existsSync(paths.stageFile)) {
    return defaultStageState();
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(paths.stageFile, 'utf-8')) as Record<string, unknown>;
    const stat = fs.statSync(paths.stageFile);
    return {
      page: normalizeStagePage(metadata.page),
      transition: normalizeStageTransition(metadata.transition),
      page5Range: normalizePage5Range(metadata.page5Range),
      page5Tag: normalizePage5Tag(metadata.page5Tag),
      mtime: stat.mtimeMs,
    };
  } catch {
    return defaultStageState();
  }
}

export function saveStageState(paths: AppPaths, payload: unknown): StageConfig {
  if (!payload || typeof payload !== 'object') {
    throw new Error('stage payload must be an object');
  }

  const raw = payload as Record<string, unknown>;
  ensureRuntimeDirs(paths);

  const metadata = {
    page: normalizeStagePage(raw.page),
    transition: normalizeStageTransition(raw.transition),
    page5Range: normalizePage5Range(raw.page5Range),
    page5Tag: normalizePage5Tag(raw.page5Tag),
  };

  fs.writeFileSync(paths.stageFile, JSON.stringify(metadata, null, 2), 'utf-8');
  return getStageState(paths);
}
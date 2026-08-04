import fs from 'node:fs';

import { DEFAULT_STAGE_PAGE, SUPPORTED_STAGE_PAGES } from '../../shared/constants.js';
import type { StageConfig, StagePageKey } from '../../shared/types.js';
import { ensureRuntimeDirs } from './image-service.js';
import type { AppPaths } from './path-service.js';

function normalizeStagePage(value: unknown): StagePageKey {
  if (typeof value === 'string' && SUPPORTED_STAGE_PAGES.has(value)) {
    return value as StagePageKey;
  }
  return DEFAULT_STAGE_PAGE as StagePageKey;
}

function defaultStageState(): StageConfig {
  return {
    page: DEFAULT_STAGE_PAGE as StagePageKey,
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
  };

  fs.writeFileSync(paths.stageFile, JSON.stringify(metadata, null, 2), 'utf-8');
  return getStageState(paths);
}
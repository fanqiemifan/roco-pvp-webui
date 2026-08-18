import fs from 'node:fs';

import type { Page6State } from '../../shared/types.js';
import { ensureRuntimeDirs } from './image-service.js';
import { getMatchStore } from './match-service.js';
import type { AppPaths } from './path-service.js';

/** 比赛结果页（page6）最多展示的比赛数量 */
export const PAGE6_MAX_MATCHES = 8;

function defaultPage6State(): Page6State {
  return {
    matchIds: [],
    title: '',
    mtime: null,
  };
}

function normalizeMatchIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      continue;
    }
    const id = item.trim();
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
    if (ids.length >= PAGE6_MAX_MATCHES) {
      break;
    }
  }
  return ids;
}

function normalizeTitle(value: unknown): string {
  return String(value ?? '').trim().slice(0, 40);
}

export function getPage6State(paths: AppPaths): Page6State {
  if (!fs.existsSync(paths.page6File)) {
    return defaultPage6State();
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(paths.page6File, 'utf-8')) as Record<string, unknown>;
    const stat = fs.statSync(paths.page6File);
    return {
      matchIds: normalizeMatchIds(metadata.matchIds),
      title: normalizeTitle(metadata.title),
      mtime: stat.mtimeMs,
    };
  } catch {
    return defaultPage6State();
  }
}

/**
 * 保存 page6 配置。仅允许收录已结束（completed）的比赛；
 * 最多 PAGE6_MAX_MATCHES 场，顺序即展示顺序。
 */
export function savePage6State(paths: AppPaths, payload: unknown): Page6State {
  if (!payload || typeof payload !== 'object') {
    throw new Error('page6 payload must be an object');
  }

  ensureRuntimeDirs(paths);

  const raw = payload as Record<string, unknown>;
  const rawMatchIds = raw.matchIds === undefined ? getPage6State(paths).matchIds : normalizeMatchIds(raw.matchIds);
  const title = raw.title === undefined ? getPage6State(paths).title : normalizeTitle(raw.title);

  const completedIds = new Set(
    getMatchStore(paths).matches
      .filter((match) => match.status === 'completed')
      .map((match) => match.id),
  );
  const matchIds = rawMatchIds.filter((id) => completedIds.has(id)).slice(0, PAGE6_MAX_MATCHES);

  const metadata = { matchIds, title };
  fs.writeFileSync(paths.page6File, JSON.stringify(metadata, null, 2), 'utf-8');
  return getPage6State(paths);
}

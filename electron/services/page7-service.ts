import fs from 'node:fs';

import type { Page7State } from '../../shared/types.js';
import { ensureRuntimeDirs } from './image-service.js';
import { getMatchStore } from './match-service.js';
import type { AppPaths } from './path-service.js';

/** 对局推送页（page7）默认主标题 */
export const PAGE7_DEFAULT_TITLE = '对局推送';

/** 对局推送页（page7）默认温馨提示 */
export const PAGE7_DEFAULT_NOTICE = '温馨提示：排名选自选手历史最高非实时';

function defaultPage7State(): Page7State {
  return {
    matchId: null,
    title: '',
    notice: '',
    mtime: null,
  };
}

function normalizeMatchId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const id = String(value).trim();
  return id || null;
}

function normalizeTitle(value: unknown): string {
  return String(value ?? '').trim().slice(0, 40);
}

function normalizeNotice(value: unknown): string {
  return String(value ?? '').trim().slice(0, 60);
}

export function getPage7State(paths: AppPaths): Page7State {
  if (!fs.existsSync(paths.page7File)) {
    return defaultPage7State();
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(paths.page7File, 'utf-8')) as Record<string, unknown>;
    const stat = fs.statSync(paths.page7File);
    return {
      matchId: normalizeMatchId(metadata.matchId),
      title: normalizeTitle(metadata.title),
      notice: normalizeNotice(metadata.notice),
      mtime: stat.mtimeMs,
    };
  } catch {
    return defaultPage7State();
  }
}

/**
 * 保存 page7 配置。matchId 必须是比赛列表中存在的比赛（传 null 清空选择）。
 */
export function savePage7State(paths: AppPaths, payload: unknown): Page7State {
  if (!payload || typeof payload !== 'object') {
    throw new Error('page7 payload must be an object');
  }

  ensureRuntimeDirs(paths);

  const raw = payload as Record<string, unknown>;
  const previous = getPage7State(paths);
  const matchId = raw.matchId === undefined ? previous.matchId : normalizeMatchId(raw.matchId);
  const title = raw.title === undefined ? previous.title : normalizeTitle(raw.title);
  const notice = raw.notice === undefined ? previous.notice : normalizeNotice(raw.notice);

  // 只允许选择比赛列表中真实存在的比赛，避免悬空引用
  const exists = matchId === null
    || getMatchStore(paths).matches.some((match) => match.id === matchId);
  const effectiveMatchId = exists ? matchId : null;

  const metadata = { matchId: effectiveMatchId, title, notice };
  fs.writeFileSync(paths.page7File, JSON.stringify(metadata, null, 2), 'utf-8');
  return getPage7State(paths);
}

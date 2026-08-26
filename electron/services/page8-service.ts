import fs from 'node:fs';

import type { Page8Background, Page8State } from '../../shared/types.js';
import { ensureRuntimeDirs } from './image-service.js';
import { getMatchStore } from './match-service.js';
import type { AppPaths } from './path-service.js';

/** 比赛预告页（page8）最多展示的比赛数量 */
export const PAGE8_MAX_MATCHES = 12;

/** 自定义壁纸访问 URL（/runtime 静态伺服 cacheDir） */
export const PAGE8_WALLPAPER_URL = '/runtime/page8-wallpaper.jpg';

/** 允许收录进比赛预告的比赛状态：待开始优先，进行中可选（开关控制） */
const PAGE8_MATCH_STATUSES = new Set(['pending', 'in_progress']);

function defaultPage8State(): Page8State {
  return {
    matchIds: [],
    title: '',
    subtitle: '',
    background: 'image',
    wallpaperUrl: '',
    mtime: null,
  };
}

function normalizeBackground(value: unknown): Page8Background {
  if (value === 'image-2' || value === 'custom') {
    return value;
  }
  return 'image';
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
    if (ids.length >= PAGE8_MAX_MATCHES) {
      break;
    }
  }
  return ids;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().slice(0, 40);
}

function normalizeWallpaperUrl(value: unknown): string {
  return String(value ?? '').trim().slice(0, 300);
}

export function getPage8State(paths: AppPaths): Page8State {
  if (!fs.existsSync(paths.page8File)) {
    return defaultPage8State();
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(paths.page8File, 'utf-8')) as Record<string, unknown>;
    const stat = fs.statSync(paths.page8File);
    const background = normalizeBackground(metadata.background);
    return {
      matchIds: normalizeMatchIds(metadata.matchIds),
      title: normalizeText(metadata.title),
      subtitle: normalizeText(metadata.subtitle),
      background,
      wallpaperUrl: normalizeWallpaperUrl(metadata.wallpaperUrl),
      mtime: stat.mtimeMs,
    };
  } catch {
    return defaultPage8State();
  }
}

/**
 * 保存 page8 配置。仅允许收录待开始（pending）或进行中（in_progress）的比赛；
 * 最多 PAGE8_MAX_MATCHES 场，顺序即展示顺序。
 */
export function savePage8State(paths: AppPaths, payload: unknown): Page8State {
  if (!payload || typeof payload !== 'object') {
    throw new Error('page8 payload must be an object');
  }

  ensureRuntimeDirs(paths);

  const raw = payload as Record<string, unknown>;
  const rawMatchIds = raw.matchIds === undefined ? getPage8State(paths).matchIds : normalizeMatchIds(raw.matchIds);
  const title = raw.title === undefined ? getPage8State(paths).title : normalizeText(raw.title);
  const subtitle = raw.subtitle === undefined ? getPage8State(paths).subtitle : normalizeText(raw.subtitle);
  const background = raw.background === undefined ? getPage8State(paths).background : normalizeBackground(raw.background);
  const wallpaperUrl = raw.wallpaperUrl === undefined ? getPage8State(paths).wallpaperUrl : normalizeWallpaperUrl(raw.wallpaperUrl);

  const allowedIds = new Set(
    getMatchStore(paths).matches
      .filter((match) => PAGE8_MATCH_STATUSES.has(match.status))
      .map((match) => match.id),
  );
  const matchIds = rawMatchIds.filter((id) => allowedIds.has(id)).slice(0, PAGE8_MAX_MATCHES);

  // 自定义壁纸仅在文件存在时保留 URL，避免悬空引用
  const effectiveWallpaperUrl = background === 'custom' && fs.existsSync(paths.page8WallpaperFile)
    ? PAGE8_WALLPAPER_URL
    : '';

  const metadata = { matchIds, title, subtitle, background, wallpaperUrl: effectiveWallpaperUrl };
  fs.writeFileSync(paths.page8File, JSON.stringify(metadata, null, 2), 'utf-8');
  return getPage8State(paths);
}
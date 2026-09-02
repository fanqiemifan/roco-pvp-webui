import fs from 'node:fs';

import type { Page11SideConfig, Page11State } from '../../shared/types.js';
import { ensureRuntimeDirs } from './image-service.js';
import type { AppPaths } from './path-service.js';

const NAME_MAX_LENGTH = 32;
const TEXT_MAX_LENGTH = 120;
const RANK_MAX_LENGTH = 10;
const PETS_MAX_LENGTH = 200;

function defaultSideConfig(): Page11SideConfig {
  return { source: 'match', name: '', rank: '', declaration: '', pets: '' };
}

function normalizeSource(value: unknown): 'manual' | 'match' {
  return value === 'manual' ? 'manual' : 'match';
}

function normalizeName(value: unknown): string {
  return String(value ?? '').trim().slice(0, NAME_MAX_LENGTH);
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().slice(0, TEXT_MAX_LENGTH);
}

/** 排名：仅保留数字（空字符串 = 未输入） */
function normalizeRank(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, RANK_MAX_LENGTH);
}

function normalizePets(value: unknown): string {
  return String(value ?? '').trim().slice(0, PETS_MAX_LENGTH);
}

function normalizeSideConfig(value: unknown): Page11SideConfig {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    source: normalizeSource(raw.source),
    name: normalizeName(raw.name),
    rank: normalizeRank(raw.rank),
    declaration: normalizeText(raw.declaration),
    pets: normalizePets(raw.pets),
  };
}

export function getPage11State(paths: AppPaths): Page11State {
  if (!fs.existsSync(paths.page11File)) {
    return { left: defaultSideConfig(), right: defaultSideConfig(), mtime: null };
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(paths.page11File, 'utf-8')) as Record<string, unknown>;
    const stat = fs.statSync(paths.page11File);
    return {
      left: normalizeSideConfig(metadata.left),
      right: normalizeSideConfig(metadata.right),
      mtime: stat.mtimeMs,
    };
  } catch {
    return { left: defaultSideConfig(), right: defaultSideConfig(), mtime: null };
  }
}

/**
 * 保存选手介绍（page11-13）配置：左右两侧的数据来源与手动填写内容。
 * source 为 match 时仅保存 source，手动填写内容仍保留，方便切回时不丢失。
 */
export function savePage11State(paths: AppPaths, payload: unknown): Page11State {
  if (!payload || typeof payload !== 'object') {
    throw new Error('page11 payload must be an object');
  }

  ensureRuntimeDirs(paths);

  const raw = payload as Record<string, unknown>;
  const current = getPage11State(paths);
  const left = raw.left === undefined ? current.left : normalizeSideConfig(raw.left);
  const right = raw.right === undefined ? current.right : normalizeSideConfig(raw.right);

  fs.writeFileSync(paths.page11File, JSON.stringify({ left, right }, null, 2), 'utf-8');
  return getPage11State(paths);
}

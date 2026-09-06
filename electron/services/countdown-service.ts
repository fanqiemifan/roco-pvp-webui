import fs from 'node:fs';

import {
  COUNTDOWN_DURATION_MAX,
  DEFAULT_COUNTDOWN_DURATION,
  DEFAULT_COUNTDOWN_THEME,
  SUPPORTED_COUNTDOWN_THEMES,
} from '../../shared/constants.js';
import type { CountdownState, CountdownTheme } from '../../shared/types.js';
import { ensureRuntimeDirs } from './image-service.js';
import type { AppPaths } from './path-service.js';

/** 倒计时归零后不再继续（显示 00:00），等待手动关闭或重置 */
function defaultCountdownState(): CountdownState {
  return {
    visible: false,
    running: false,
    duration: DEFAULT_COUNTDOWN_DURATION,
    remainingSeconds: DEFAULT_COUNTDOWN_DURATION * 60,
    endAt: null,
    theme: DEFAULT_COUNTDOWN_THEME as CountdownTheme,
    mtime: null,
  };
}

function normalizeTheme(value: unknown): CountdownTheme {
  return typeof value === 'string' && SUPPORTED_COUNTDOWN_THEMES.has(value)
    ? (value as CountdownTheme)
    : DEFAULT_COUNTDOWN_THEME as CountdownTheme;
}

/** 时长（分钟）1-60 */
function normalizeDuration(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_COUNTDOWN_DURATION;
  }
  return Math.min(COUNTDOWN_DURATION_MAX, Math.max(1, Math.round(numeric)));
}

function normalizeRemaining(value: unknown, duration: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return duration * 60;
  }
  return Math.min(duration * 60, Math.max(0, Math.round(numeric)));
}

function writeCountdownState(paths: AppPaths, state: Omit<CountdownState, 'mtime'>): CountdownState {
  ensureRuntimeDirs(paths);
  const metadata = {
    visible: state.visible,
    running: state.running,
    duration: state.duration,
    remainingSeconds: state.remainingSeconds,
    endAt: state.endAt,
    theme: state.theme,
  };
  fs.writeFileSync(paths.countdownFile, JSON.stringify(metadata, null, 2), 'utf-8');
  return getCountdownState(paths);
}

/**
 * 读取倒计时状态：
 * 懒归一化——running 且已过 endAt 时（定时器丢失/服务重启），落地为静止 00:00。
 */
export function getCountdownState(paths: AppPaths): CountdownState {
  const fallback = defaultCountdownState();
  if (!fs.existsSync(paths.countdownFile)) {
    return fallback;
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(paths.countdownFile, 'utf-8')) as Record<string, unknown>;
    const stat = fs.statSync(paths.countdownFile);
    const duration = normalizeDuration(metadata.duration);
    const running = Boolean(metadata.running) && Number.isFinite(Number(metadata.endAt));
    const endAt = Number.isFinite(Number(metadata.endAt)) ? Number(metadata.endAt) : null;

    // 倒计时已走完：静止显示 00:00
    if (running && endAt !== null && endAt <= Date.now()) {
      return writeCountdownState(paths, {
        visible: Boolean(metadata.visible),
        running: false,
        duration,
        remainingSeconds: 0,
        endAt: null,
        theme: normalizeTheme(metadata.theme),
      });
    }

    return {
      visible: Boolean(metadata.visible),
      running,
      duration,
      remainingSeconds: normalizeRemaining(metadata.remainingSeconds, duration),
      endAt: running ? endAt : null,
      theme: normalizeTheme(metadata.theme),
      mtime: stat.mtimeMs,
    };
  } catch {
    return fallback;
  }
}

/** 保存配置（时长 / 配色），不改变显示与倒计时进行状态 */
export function saveCountdownState(paths: AppPaths, payload: unknown): CountdownState {
  if (!payload || typeof payload !== 'object') {
    throw new Error('countdown payload must be an object');
  }
  const raw = payload as Record<string, unknown>;
  const current = getCountdownState(paths);
  const duration = normalizeDuration(raw.duration === undefined ? current.duration : raw.duration);

  // 时长变化时静止状态下的剩余时间按比例换算为「新时长 - 已走时间」：
  // 简化处理——未开始过（remaining == 旧时长*60）则直接重置为新时长；倒计时中不受影响
  const untouched = current.remainingSeconds === current.duration * 60;
  const remainingSeconds = untouched
    ? duration * 60
    : Math.min(current.remainingSeconds, duration * 60);

  return writeCountdownState(paths, {
    ...current,
    duration,
    remainingSeconds,
    theme: normalizeTheme(raw.theme === undefined ? current.theme : raw.theme),
  });
}

/** 开启显示（进场）：推流载体顶部叠加小插件 */
export function showCountdown(paths: AppPaths): CountdownState {
  const current = getCountdownState(paths);
  return writeCountdownState(paths, { ...current, visible: true });
}

/** 关闭显示（退场）：同时暂停倒计时，下次开启从剩余时间继续 */
export function hideCountdown(paths: AppPaths): CountdownState {
  const current = getCountdownState(paths);
  return writeCountdownState(paths, { ...current, visible: false, running: false, endAt: null });
}

/** 开始倒计时：从当前剩余时间继续（剩余 0 时自动回到配置时长） */
export function startCountdown(paths: AppPaths): CountdownState {
  const current = getCountdownState(paths);
  const remaining = current.remainingSeconds > 0 ? current.remainingSeconds : current.duration * 60;
  return writeCountdownState(paths, {
    ...current,
    visible: true,
    running: true,
    remainingSeconds: remaining,
    endAt: Date.now() + remaining * 1000,
  });
}

/** 暂停倒计时：剩余时间落地保存 */
export function pauseCountdown(paths: AppPaths): CountdownState {
  const current = getCountdownState(paths);
  if (!current.running || current.endAt === null) {
    return current;
  }
  const remainingSeconds = Math.max(0, Math.ceil((current.endAt - Date.now()) / 1000));
  return writeCountdownState(paths, {
    ...current,
    running: false,
    remainingSeconds,
    endAt: null,
  });
}

/** 重置：剩余时间回到配置时长并静止 */
export function resetCountdown(paths: AppPaths): CountdownState {
  const current = getCountdownState(paths);
  return writeCountdownState(paths, {
    ...current,
    running: false,
    remainingSeconds: current.duration * 60,
    endAt: null,
  });
}

import fs from 'node:fs';

import type { BackgroundState } from '../../shared/types.js';
import type { AppPaths } from './path-service.js';

export function ensureRuntimeDirs(paths: AppPaths): void {
  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  fs.mkdirSync(paths.cacheDir, { recursive: true });
}

export function getBackgroundState(paths: AppPaths): BackgroundState {
  if (!fs.existsSync(paths.backgroundFile)) {
    return { exists: false };
  }

  const stat = fs.statSync(paths.backgroundFile);
  return {
    exists: true,
    path: '/runtime/background.png',
    size: stat.size,
    mtime: stat.mtimeMs,
  };
}

export function saveBackground(paths: AppPaths, buffer: Buffer): BackgroundState {
  ensureRuntimeDirs(paths);
  fs.writeFileSync(paths.backgroundFile, buffer);
  return getBackgroundState(paths);
}

export function deleteBackground(paths: AppPaths): BackgroundState {
  if (fs.existsSync(paths.backgroundFile)) {
    fs.unlinkSync(paths.backgroundFile);
  }
  return getBackgroundState(paths);
}

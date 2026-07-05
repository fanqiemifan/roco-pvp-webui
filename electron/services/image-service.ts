import fs from 'node:fs';

import type { AvatarCollectionState, AvatarState, BackgroundState } from '../../shared/types.js';
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

type AvatarSide = 'left' | 'right';

function avatarFilePath(paths: AppPaths, side: AvatarSide): string {
  return side === 'left' ? paths.leftAvatarFile : paths.rightAvatarFile;
}

function avatarMetaFilePath(paths: AppPaths, side: AvatarSide): string {
  return side === 'left' ? paths.leftAvatarMetaFile : paths.rightAvatarMetaFile;
}

export function getAvatarState(paths: AppPaths, side: AvatarSide): AvatarState {
  const filePath = avatarFilePath(paths, side);
  if (!fs.existsSync(filePath)) {
    return { side, exists: false };
  }

  const stat = fs.statSync(filePath);
  return {
    side,
    exists: true,
    path: `/api/avatar/${side}-avatar.png`,
    size: stat.size,
    mtime: stat.mtimeMs,
  };
}

export function getAvatarStates(paths: AppPaths): AvatarCollectionState {
  return {
    left: getAvatarState(paths, 'left'),
    right: getAvatarState(paths, 'right'),
  };
}

export function saveAvatar(paths: AppPaths, side: AvatarSide, buffer: Buffer, mimeType?: string): AvatarState {
  ensureRuntimeDirs(paths);
  fs.writeFileSync(avatarFilePath(paths, side), buffer);
  fs.writeFileSync(
    avatarMetaFilePath(paths, side),
    JSON.stringify({ mimeType: typeof mimeType === 'string' ? mimeType : 'image/png' }, null, 2),
    'utf-8',
  );
  return getAvatarState(paths, side);
}

export function deleteAvatar(paths: AppPaths, side: AvatarSide): AvatarState {
  const filePath = avatarFilePath(paths, side);
  const metaFilePath = avatarMetaFilePath(paths, side);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  if (fs.existsSync(metaFilePath)) {
    fs.unlinkSync(metaFilePath);
  }

  return getAvatarState(paths, side);
}

export function readAvatarMimeType(paths: AppPaths, side: AvatarSide): string {
  const metaFilePath = avatarMetaFilePath(paths, side);
  if (!fs.existsSync(metaFilePath)) {
    return 'image/png';
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8')) as { mimeType?: string };
    return typeof metadata.mimeType === 'string' && metadata.mimeType.trim()
      ? metadata.mimeType
      : 'image/png';
  } catch {
    return 'image/png';
  }
}

import fs from 'node:fs';

import sharp from 'sharp';

import type { AvatarCollectionState, AvatarState } from '../../shared/types.js';
import type { AppPaths } from './path-service.js';

// 上传头像统一缩放并压缩到该尺寸（64/72px 圆形显示，2x 兼顾高清屏）
const AVATAR_OUTPUT_SIZE = 128;
const AVATAR_OUTPUT_MIME = 'image/png';

export function ensureRuntimeDirs(paths: AppPaths): void {
  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  fs.mkdirSync(paths.cacheDir, { recursive: true });
}

type AvatarSide = 'left' | 'right';

// Only real raster image types are ever accepted for avatars. Anything else
// (HTML/SVG/JS/arbitrary bytes served back with a spoofable Content-Type) is
// rejected so the avatar endpoint can never be weaponised as same-origin XSS.
const ALLOWED_AVATAR_MIME_TYPES = new Set<string>(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * Detect the image type from the buffer's magic bytes and return the matching
 * allowlisted MIME type, or `null` when the payload is not a supported image.
 *
 * A magic-byte check is authoritative: it does not trust any client-supplied
 * `mimetype` (which is trivially spoofable).
 */
function detectImageMimeType(buffer: Buffer): string | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e
    && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a
    && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // GIF: 'GIF87a' / 'GIF89a'
  if (
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46
    && buffer[3] === 0x38 && (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61
  ) {
    return 'image/gif';
  }

  // WebP: 'RIFF' .... 'WEBP'
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
    && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

function isAllowedAvatarMimeType(mimeType: string): boolean {
  return ALLOWED_AVATAR_MIME_TYPES.has(mimeType);
}

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

export async function saveAvatar(paths: AppPaths, side: AvatarSide, buffer: Buffer, _mimeType?: string): Promise<AvatarState> {
  // Authoritative validation based on the actual file content, never on the
  // client-supplied mimetype. Non-image payloads are rejected outright so they
  // can never be stored and later served back with a controllable Content-Type.
  const detectedMimeType = detectImageMimeType(buffer);
  if (!detectedMimeType) {
    throw new Error('仅支持 PNG / JPEG / GIF / WebP 图片文件');
  }

  ensureRuntimeDirs(paths);
  // 等比缩放并裁剪为正方形头像，统一压缩为 PNG 落盘
  const resized = await sharp(buffer)
    .rotate()
    .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer();

  fs.writeFileSync(avatarFilePath(paths, side), resized);
  fs.writeFileSync(
    avatarMetaFilePath(paths, side),
    JSON.stringify({ mimeType: AVATAR_OUTPUT_MIME }, null, 2),
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
    const mimeType = typeof metadata.mimeType === 'string' ? metadata.mimeType.trim() : '';
    // Belt-and-suspenders: never trust a stored value to be safe — only ever
    // return an allowlisted image type so the serving endpoint cannot emit an
    // attacker-controlled Content-Type (e.g. text/html) from an old/bad file.
    return isAllowedAvatarMimeType(mimeType) ? mimeType : 'image/png';
  } catch {
    return 'image/png';
  }
}

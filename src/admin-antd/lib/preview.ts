import { PREVIEW_PAGES } from '../constants';
import type { PreviewConfig, PreviewSlotKey } from '../types';

export function getPreviewOrigin(): string {
  return `${window.location.protocol}//${window.location.host}`;
}

export function getPreviewPage(slot: PreviewSlotKey): PreviewConfig {
  return PREVIEW_PAGES[slot];
}

export function buildPreviewUrl(slot: PreviewSlotKey): string {
  return `${getPreviewOrigin()}${getPreviewPage(slot).path}`;
}

export function getLocalAddressText(slot: PreviewSlotKey): string {
  const host = window.location.port ? `127.0.0.1:${window.location.port}` : '127.0.0.1';
  const path = getPreviewPage(slot).path;
  return path === '/' ? host : `${host}${path}`;
}

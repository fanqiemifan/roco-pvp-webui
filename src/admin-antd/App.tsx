/*
This project uses Ant Design (https://ant.design), licensed under the MIT License.
*/
import React, { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  ConfigProvider,
  Divider,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Layout,
  List,
  Menu,
  Modal,
  Row,
  Segmented,
  Select,
  Slider,
  Space,
  Spin,
  Statistic,
  Steps,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { io } from 'socket.io-client';
import attributeMapping from '../../resources/data/attribute_mapping.json';

import { SOCKET_EVENTS } from '../../shared/events';
import type {
  AvatarCollectionState,
  BackgroundState,
  GameRecord,
  MatchRecord,
  MatchStoreState,
  PanelState,
  Page4PanelState,
  Page4SlotState,
  Page4State,
  QuickFillMatch,
  ScoreboardState,
  SlotState,
  SpriteRecord,
} from '../../shared/types';

const { Header, Sider, Content } = Layout;
const { Title, Paragraph, Text, Link } = Typography;
const { TextArea } = Input;

type PanelSide = 'left' | 'right';
type ViewKey = 'roster' | 'live' | 'page4' | 'history' | 'scoreboard' | 'background' | 'preview' | 'about';

type PreviewSlotKey = 'page1' | 'page2' | 'page3' | 'page4' | 'standby';

type JsonInit = RequestInit & {
  json?: unknown;
};

type MatchFormValues = {
  leftPlayer: string;
  rightPlayer: string;
  bestOf: number;
  tags?: string[];
};

type CreateMatchValues = MatchFormValues;

type ScoreboardFormValues = {
  scoreboardEnabled: boolean;
  healthBadgeEnabled: boolean;
  abilityBadgeEnabled: boolean;
  centerAreaEnabled: boolean;
  centerAreaColor: string;
  eventTitleEnabled: boolean;
  eventTitle: string;
  page2LineupDisplayMode: 'default' | 'avatar-only';
  nameFontSize: number;
  scoreFontSize: number;
};

type PanelEditorState = {
  selected: SlotState[];
  activeSlot: number;
  search: string;
  quickFillInput: string;
  quickFillMatches: QuickFillMatch[];
  autoSaveEnabled: boolean;
  dirty: boolean;
  saving: boolean;
};

type Page4PanelEditorState = {
  selected: Page4SlotState[];
  activeSlot: number;
  search: string;
  autoSaveEnabled: boolean;
  dirty: boolean;
  saving: boolean;
};

type SpriteFilterState = {
  selectedAttributes: string[];
  selectedForms: string[];
  selectedFinalForm: boolean;
};

type AttributeOption = {
  code: string;
  label: string;
  iconPath: string;
};

type PreviewConfig = {
  title: string;
  fileName: string;
  path: string;
};

type NoticeTone = 'success' | 'info' | 'warning' | 'error';

type NoticeState = {
  tone: NoticeTone;
  text: string;
} | null;

type LiveField = 'healthPercent' | 'energyValue';

type LiveConfigPayload = {
  left: Array<{ name: string; HP: number; value: number }>;
  right: Array<{ name: string; HP: number; value: number }>;
};

declare global {
  interface Window {
    rocoDesktop?: {
      copyText?: (text: string) => Promise<void>;
      showOpenDialog?: () => Promise<string | null>;
      showSaveDialog?: () => Promise<string | null>;
      readTextFile?: (filePath: string) => Promise<string>;
      writeTextFile?: (filePath: string, text: string) => Promise<boolean>;
      statFile?: (filePath: string) => Promise<{ mtimeMs: number; size: number }>;
    };
    showOpenFilePicker?: (options?: unknown) => Promise<Array<{ getFile: () => Promise<File>; queryPermission?: (options?: unknown) => Promise<string>; requestPermission?: (options?: unknown) => Promise<string>; createWritable?: () => Promise<{ write: (text: string) => Promise<void>; close: () => Promise<void> }> }>>;
    showSaveFilePicker?: (options?: unknown) => Promise<{ getFile: () => Promise<File>; queryPermission?: (options?: unknown) => Promise<string>; requestPermission?: (options?: unknown) => Promise<string>; createWritable: () => Promise<{ write: (text: string) => Promise<void>; close: () => Promise<void> }> }>;
  }
}

const DEFAULT_TAGS = ['淘汰赛', '海选赛', '128进64', '64进32', '32进16', '16进8', '8进4', '4进2', '季军赛', '决赛'];

const PREVIEW_PAGES: Record<PreviewSlotKey, PreviewConfig> = {
  page1: {
    title: '推流页面1',
    fileName: 'index.html',
    path: '/',
  },
  page2: {
    title: '推流页面2',
    fileName: 'roco-pvp.html',
    path: '/roco-pvp.html',
  },
  page3: {
    title: '推流页面3',
    fileName: 'roco-pvp-page3.html',
    path: '/roco-pvp-page3.html',
  },
  page4: {
    title: '推流页面4',
    fileName: 'roco-pvp-page4.html',
    path: '/roco-pvp-page4.html',
  },
  standby: {
    title: '等待页 Demo',
    fileName: 'live-standby-demo.html',
    path: '/live-standby-demo.html',
  },
};

const ATTRIBUTE_OPTIONS: AttributeOption[] = (attributeMapping as Array<{ 编号: string; 属性: string }>).map((item) => ({
  code: item.编号,
  label: item.属性,
  iconPath: `/resources/attribute/${item.编号}.png`,
}));

const ATTRIBUTE_ICON_BY_LABEL = new Map(ATTRIBUTE_OPTIONS.map((option) => [option.label, option.iconPath]));
const FINAL_FORM_FILTER_LABEL = '最终形态';
const EXCLUSIVE_FORM_FILTERS = ['首领', '一阶', '二阶', '三阶'];

const theme = {
  token: {
    colorPrimary: '#c7632f',
    colorInfo: '#b8894c',
    colorSuccess: '#2d7a58',
    colorWarning: '#d38b2d',
    colorError: '#c24635',
    colorBgBase: '#f6efe6',
    colorTextBase: '#2f2418',
    colorBorder: 'rgba(91, 67, 43, 0.14)',
    borderRadius: 12,
    borderRadiusLG: 16,
    controlHeight: 42,
    fontFamily: '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  components: {
    Layout: {
      bodyBg: 'transparent',
      siderBg: 'rgba(255, 251, 246, 0.92)',
      headerBg: 'transparent',
    },
    Card: {
      borderRadiusLG: 16,
    },
    Button: {
      borderRadius: 12,
      controlHeight: 42,
    },
    Input: {
      borderRadius: 12,
    },
    InputNumber: {
      borderRadius: 12,
    },
    Select: {
      borderRadius: 12,
    },
    Collapse: {
      borderRadiusLG: 14,
    },
    Upload: {
      colorFillAlter: 'rgba(255, 250, 245, 0.9)',
    },
    Table: {
      borderColor: 'rgba(91, 67, 43, 0.12)',
      headerBg: '#fbf4ea',
    },
  },
};

function createEmptySlot(index: number): SlotState {
  return {
    slot: index,
    sprite: null,
    opacityEnabled: false,
    opacity: 0.5,
    effectiveOpacity: 1,
    saturation: 1,
    healthEnabled: true,
    healthPercent: 100,
    energyValue: 10,
  };
}

function createPanelEditorState(): PanelEditorState {
  return {
    selected: Array.from({ length: 6 }, (_, index) => createEmptySlot(index)),
    activeSlot: 0,
    search: '',
    quickFillInput: '',
    quickFillMatches: [],
    autoSaveEnabled: true,
    dirty: false,
    saving: false,
  };
}

function createPage4EmptySlot(index: number): Page4SlotState {
  return {
    slot: index,
    sprite: null,
    isDead: false,
  };
}

function createPage4PanelEditorState(): Page4PanelEditorState {
  return {
    selected: Array.from({ length: 6 }, (_, index) => createPage4EmptySlot(index)),
    activeSlot: 0,
    search: '',
    autoSaveEnabled: true,
    dirty: false,
    saving: false,
  };
}

function createSpriteFilterState(options?: { selectedFinalForm?: boolean }): SpriteFilterState {
  return {
    selectedAttributes: [],
    selectedForms: [],
    selectedFinalForm: options?.selectedFinalForm ?? false,
  };
}

function createDefaultSpriteFilterState(): SpriteFilterState {
  return createSpriteFilterState({ selectedFinalForm: true });
}

function cloneSlot(slot: Partial<SlotState> | null | undefined, index: number): SlotState {
  return {
    slot: index,
    sprite: slot?.sprite ?? null,
    opacityEnabled: Boolean(slot?.opacityEnabled),
    opacity: typeof slot?.opacity === 'number' ? slot.opacity : 0.5,
    effectiveOpacity: slot?.opacityEnabled ? (typeof slot.opacity === 'number' ? slot.opacity : 0.5) : 1,
    saturation: typeof slot?.saturation === 'number' ? slot.saturation : 1,
    healthEnabled: slot?.healthEnabled !== false,
    healthPercent: typeof slot?.healthPercent === 'number' ? slot.healthPercent : 100,
    energyValue: typeof slot?.energyValue === 'number' ? slot.energyValue : 10,
  };
}

function cloneSelected(selected: SlotState[] | undefined): SlotState[] {
  const next = Array.from({ length: 6 }, (_, index) => {
    const source = selected?.[index];
    return cloneSlot(source, index);
  });
  return next;
}

function clonePage4Slot(slot: Partial<Page4SlotState> | null | undefined, index: number): Page4SlotState {
  return {
    slot: index,
    sprite: slot?.sprite ?? null,
    isDead: Boolean(slot?.isDead),
  };
}

function clonePage4Selected(selected: Page4SlotState[] | undefined): Page4SlotState[] {
  return Array.from({ length: 6 }, (_, index) => clonePage4Slot(selected?.[index], index));
}

function panelStateToSelected(panel: PanelState | null | undefined): SlotState[] {
  return cloneSelected(panel?.selected);
}

function page4PanelStateToSelected(panel: Page4PanelState | null | undefined): Page4SlotState[] {
  return clonePage4Selected(panel?.selected);
}

function buildPanelRequest(selected: SlotState[]) {
  return selected.map((slot, index) => ({
    slot: index,
    sprite: slot.sprite?.id ?? null,
    opacityEnabled: slot.opacityEnabled,
    opacity: slot.opacity,
    saturation: slot.saturation,
    healthEnabled: slot.healthEnabled,
    healthPercent: slot.healthPercent,
    energyValue: slot.energyValue,
  }));
}

function buildPage4Request(selected: Page4SlotState[]) {
  return selected.map((slot, index) => ({
    slot: index,
    sprite: slot.sprite?.id ?? null,
    isDead: slot.isDead,
  }));
}

function summarizePage4Slots(selected: Page4SlotState[]) {
  const selectedCount = selected.filter((slot) => slot.sprite).length;
  const deadCount = selected.filter((slot) => slot.sprite && slot.isDead).length;
  return { selectedCount, deadCount };
}

function getPreviewOrigin(): string {
  return `${window.location.protocol}//${window.location.host}`;
}

function getPreviewPage(slot: PreviewSlotKey): PreviewConfig {
  return PREVIEW_PAGES[slot];
}

function buildPreviewUrl(slot: PreviewSlotKey): string {
  return `${getPreviewOrigin()}${getPreviewPage(slot).path}`;
}

function getLocalAddressText(slot: PreviewSlotKey): string {
  const host = window.location.port ? `127.0.0.1:${window.location.port}` : '127.0.0.1';
  const path = getPreviewPage(slot).path;
  return path === '/' ? host : `${host}${path}`;
}

function winsNeeded(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

function summarizeSeriesForBestOf(match: MatchRecord, bestOf: number) {
  const needed = winsNeeded(bestOf);
  let leftScore = 0;
  let rightScore = 0;
  let completedGameCount = 0;
  let winner: MatchRecord['winner'] = null;

  for (const game of match.games) {
    if (game.status !== 'completed' || (game.winner !== 'left' && game.winner !== 'right')) {
      continue;
    }

    completedGameCount += 1;
    if (game.winner === 'left') {
      leftScore += 1;
    } else {
      rightScore += 1;
    }

    if (leftScore >= needed || rightScore >= needed) {
      winner = game.winner;
      break;
    }
  }

  return {
    leftScore,
    rightScore,
    completedGameCount,
    winner,
  };
}

function getActiveMatch(matchStore: MatchStoreState): MatchRecord | null {
  return matchStore.matches.find((match) => match.id === matchStore.activeMatchId) ?? null;
}

function getCurrentGame(match: MatchRecord | null) {
  if (!match) {
    return null;
  }
  return match.games.find((game) => game.status === 'in_progress')
    ?? match.games.find((game) => game.status === 'pending')
    ?? null;
}

function formatLineupSummary(lineup: string[], spriteMap: Map<string, SpriteRecord>): string {
  if (!lineup.length) {
    return '待设置';
  }
  return lineup
    .map((spriteId) => spriteMap.get(spriteId)?.displayName ?? spriteId)
    .join(' / ');
}

function basename(value: string | null | undefined): string {
  return String(value ?? '').split('/').filter(Boolean).pop() ?? '';
}

function buildSpriteLookup(records: SpriteRecord[]): Map<string, SpriteRecord> {
  const lookup = new Map<string, SpriteRecord>();

  records.forEach((sprite) => {
    const keys = new Set<string>([
      sprite.id,
      sprite.filename,
      sprite.displayName,
      sprite.name,
      sprite.chineseName,
      basename(sprite.id),
      basename(sprite.filename),
      basename(sprite.path),
      ...(Array.isArray(sprite.aliases) ? sprite.aliases : []),
    ]);

    keys.forEach((key) => {
      if (typeof key === 'string' && key.trim()) {
        lookup.set(key.trim(), sprite);
      }
    });
  });

  return lookup;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMatchStatusColor(status: MatchRecord['status']): string {
  if (status === 'completed') {
    return 'success';
  }
  if (status === 'in_progress') {
    return 'processing';
  }
  return 'default';
}

function getMatchStatusLabel(status: MatchRecord['status']): string {
  if (status === 'completed') {
    return '已完成';
  }
  if (status === 'in_progress') {
    return '进行中';
  }
  return '待开始';
}

function getNoticeTagColor(tone: NoticeTone): string {
  if (tone === 'success') {
    return 'success';
  }
  if (tone === 'warning') {
    return 'warning';
  }
  if (tone === 'error') {
    return 'error';
  }
  return 'processing';
}

function getGameStatusLabel(status: GameRecord['status']): string {
  if (status === 'completed') {
    return '已完成';
  }
  if (status === 'in_progress') {
    return '进行中';
  }
  return '待开始';
}

function getGameResultLabel(game: GameRecord): string {
  if (game.status === 'in_progress') {
    return '进行中';
  }
  if (game.status !== 'completed' || !game.winner) {
    return '待结算';
  }
  return game.winner === 'left' ? '左侧胜' : '右侧胜';
}

function summarizePanelSlots(selected: SlotState[]) {
  const selectedCount = selected.filter((slot) => slot.sprite).length;
  const aliveCount = selected.filter((slot) => slot.sprite && slot.healthPercent > 0).length;
  return { selectedCount, aliveCount };
}

function splitSpriteAttributes(value: string | null | undefined): string[] {
  return String(value ?? '')
    .split(/[、/,，\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanSpriteCardName(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/[-_－—]\d+$/u, '');
}

function getSpriteCardNameLeft(nameLength: number): number {
  switch (nameLength) {
    case 2:
      return 44;
    case 3:
      return 40;
    case 4:
      return 37;
    case 5:
      return 34;
    default:
      return nameLength <= 2 ? 44 : 37;
  }
}

function resolveSpriteAttributeIcons(sprite: SpriteRecord): string[] {
  const directIcons = [sprite.attributeIcon1, sprite.attributeIcon2].filter(Boolean);
  if (directIcons.length > 0) {
    return directIcons;
  }

  const directCodes = (sprite.attributeCodes ?? [])
    .map((code) => code.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((code) => `/resources/attribute/${code}.png`);

  if (directCodes.length > 0) {
    return directCodes;
  }

  return splitSpriteAttributes(sprite.attribute)
    .map((attribute) => ATTRIBUTE_ICON_BY_LABEL.get(attribute) ?? '')
    .filter(Boolean)
    .slice(0, 2);
}

type SpritePetCardProps = {
  sprite: SpriteRecord;
  size?: number;
  className?: string;
};

function SpritePetCard({ sprite, size = 96, className }: SpritePetCardProps) {
  const cardName = cleanSpriteCardName(sprite.cardName || sprite.displayName || sprite.chineseName || sprite.name);
  const attributeIcons = resolveSpriteAttributeIcons(sprite);
  const attributeIcon1 = attributeIcons[0] ?? '';
  const attributeIcon2 = attributeIcons[1] ?? '';
  const style = {
    '--pet-card-size': `${size}px`,
    '--pet-name-left': String(getSpriteCardNameLeft(cardName.length)),
  } as React.CSSProperties;

  return (
    <div
      className={`sprite-pet-card${attributeIcon2 ? ' sprite-pet-card-has-attr2' : ''}${className ? ` ${className}` : ''}`}
      style={style}
    >
      <div className="sprite-pet-card-bg" />
      {attributeIcon2 ? <div className="sprite-pet-card-attr-circle" /> : null}
      <img className="sprite-pet-card-sprite" src={sprite.path} alt={sprite.displayName} />
      {attributeIcon1 ? (
        <img className="sprite-pet-card-attr sprite-pet-card-attr-1" src={attributeIcon1} alt="" />
      ) : null}
      {attributeIcon2 ? (
        <img className="sprite-pet-card-attr sprite-pet-card-attr-2" src={attributeIcon2} alt="" />
      ) : null}
      <div className="sprite-pet-card-name-bg" />
      <span className="sprite-pet-card-name">{cardName}</span>
    </div>
  );
}

function buildHistoryLineupEntries(
  game: GameRecord,
  side: PanelSide,
  spriteMap: Map<string, SpriteRecord>,
): Array<{ id: string; name: string; path: string } | null> {
  const slotSource = side === 'left' ? game.leftSlots : game.rightSlots;
  const lineupSource = side === 'left' ? game.leftLineup : game.rightLineup;
  const slotEntries = slotSource
    .filter((slot) => slot?.spriteId)
    .map((slot) => slot.spriteId as string);
  const source = slotEntries.length ? slotEntries : lineupSource;
  const entries: Array<{ id: string; name: string; path: string } | null> = source.slice(0, 6).map((spriteId) => {
    const sprite = spriteMap.get(spriteId);
    return {
      id: spriteId,
      name: sprite?.displayName ?? spriteId,
      path: sprite?.path ?? '',
    };
  });

  while (entries.length < 6) {
    entries.push(null);
  }

  return entries;
}

function buildHistoryBattleEntries(
  game: GameRecord,
  spriteMap: Map<string, SpriteRecord>,
): Array<{ id: string; name: string; path: string; side: PanelSide } | null> {
  return [
    ...buildHistoryLineupEntries(game, 'left', spriteMap).map((entry) => (entry ? { ...entry, side: 'left' as const } : null)),
    ...buildHistoryLineupEntries(game, 'right', spriteMap).map((entry) => (entry ? { ...entry, side: 'right' as const } : null)),
  ];
}

function getVisibleGames(record: MatchRecord) {
  return record.games.filter((game) => (
    game.status !== 'pending'
    || game.leftLineup.length > 0
    || game.rightLineup.length > 0
  ));
}

async function requestJson<T>(url: string, init?: JsonInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.json ? { 'Content-Type': 'application/json' } : null),
      ...(init?.headers ?? {}),
    },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    if (typeof payload === 'object' && payload && 'error' in payload) {
      throw new Error(String((payload as { error?: unknown }).error ?? '请求失败'));
    }
    throw new Error(typeof payload === 'string' ? payload : `${response.status} 请求失败`);
  }

  return payload as T;
}

async function uploadSingleFile<T>(url: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);
  return requestJson<T>(url, {
    method: 'POST',
    body: formData,
  });
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (window.rocoDesktop?.copyText) {
    await window.rocoDesktop.copyText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function buildHistoryTags(matches: MatchStoreState['matches']): string[] {
  const tagSet = new Set<string>();
  for (const tag of DEFAULT_TAGS) {
    tagSet.add(tag);
  }
  matches.forEach((match) => {
    (match.tags ?? []).forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet);
}

function buildProgressItems(match: MatchRecord | null) {
  if (!match) {
    return {
      current: 0,
      items: [
        { title: '创建赛事' },
        { title: '录入阵容' },
        { title: '开始对局' },
        { title: '记录结果' },
        { title: '完成系列赛' },
      ],
    };
  }

  const currentGame = getCurrentGame(match);
  const readyToStart = Boolean(
    currentGame
    && currentGame.leftLineup.length > 0
    && currentGame.rightLineup.length > 0,
  );

  let current = 1;
  if (currentGame?.status === 'in_progress') {
    current = 3;
  } else if (readyToStart) {
    current = 2;
  }
  if (match.status === 'completed') {
    current = 4;
  }

  return {
    current,
    items: [
      { title: '创建赛事' },
      { title: '录入阵容' },
      { title: '开始对局' },
      { title: '记录结果' },
      { title: '完成系列赛' },
    ],
  };
}

function cleanSpriteName(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\.(png|jpe?g|webp)$/i, '')
    .replace(/^NO\.\d+_/i, '')
    .replace(/[-_]\d+$/u, '');
}

function getSlotName(slot: SlotState | null | undefined): string {
  const sprite = slot?.sprite;
  if (!sprite) {
    return '';
  }
  return cleanSpriteName(sprite.displayName || sprite.chineseName || sprite.name || sprite.filename || sprite.id);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getHealthLevel(slot: SlotState | null | undefined): number {
  if (!slot || !slot.healthEnabled || typeof slot.healthPercent !== 'number') {
    return 100;
  }
  return clampNumber(slot.healthPercent, 0, 100);
}

function getEnergyLevel(slot: SlotState | null | undefined): number {
  if (!slot || typeof slot.energyValue !== 'number') {
    return 10;
  }
  return clampNumber(Math.round(slot.energyValue), 0, 10);
}

function buildLiveConfigPayload(panels: Record<PanelSide, PanelEditorState>): LiveConfigPayload {
  const mapSlot = (slot: SlotState) => ({
    name: getSlotName(slot),
    HP: clampNumber(Math.round(Number(slot.healthPercent) || 0), 0, 100),
    value: clampNumber(Math.round(Number(slot.energyValue) || 0), 0, 10),
  });

  return {
    left: panels.left.selected.filter((slot) => slot.sprite).map(mapSlot),
    right: panels.right.selected.filter((slot) => slot.sprite).map(mapSlot),
  };
}

function stringifyLiveConfig(panels: Record<PanelSide, PanelEditorState>): string {
  return JSON.stringify(buildLiveConfigPayload(panels), null, 2);
}

function extractLiveConfigPanel(payload: Record<string, unknown>, panel: PanelSide) {
  const direct = payload[panel];
  if (Array.isArray(direct)) {
    return direct;
  }
  if (direct && typeof direct === 'object' && Array.isArray((direct as { selected?: unknown[] }).selected)) {
    return (direct as { selected: unknown[] }).selected;
  }
  const panels = payload.panels;
  if (panels && typeof panels === 'object') {
    const nested = (panels as Record<string, unknown>)[panel];
    if (Array.isArray(nested)) {
      return nested;
    }
  }
  return null;
}

function readNumberField(item: Record<string, unknown>, names: string[], min: number, max: number) {
  for (const name of names) {
    const value = item[name];
    if (value !== undefined && value !== null && value !== '') {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        return clampNumber(Math.round(numeric), min, max);
      }
    }
  }
  return null;
}

function findConfigTargetIndex(
  panel: PanelSide,
  item: Record<string, unknown>,
  fallbackIndex: number,
  usedIndexes: Set<number>,
  panels: Record<PanelSide, PanelEditorState>,
) {
  const expectedName = cleanSpriteName(typeof item.name === 'string' ? item.name : '');
  if (expectedName) {
    const matchIndex = panels[panel].selected.findIndex((slot, index) => {
      return !usedIndexes.has(index) && getSlotName(slot) === expectedName;
    });
    if (matchIndex >= 0) {
      return matchIndex;
    }
  }
  return fallbackIndex;
}

function Dashboard() {
  const { message, modal } = App.useApp();
  const [view, setView] = useState<ViewKey>('roster');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState('');
  const [scoreboard, setScoreboard] = useState<ScoreboardState | null>(null);
  const [matchStore, setMatchStore] = useState<MatchStoreState>({
    activeMatchId: null,
    matches: [],
    history: {
      canUndo: false,
      canRedo: false,
      canUndoDelete: false,
      deleteUndoCount: 0,
    },
    mtime: null,
  });
  const [background, setBackground] = useState<BackgroundState>({ exists: false });
  const [avatars, setAvatars] = useState<AvatarCollectionState>({
    left: { side: 'left', exists: false },
    right: { side: 'right', exists: false },
  });
  const [panels, setPanels] = useState<Record<PanelSide, PanelEditorState>>({
    left: createPanelEditorState(),
    right: createPanelEditorState(),
  });
  const [page4Panels, setPage4Panels] = useState<Record<PanelSide, Page4PanelEditorState>>({
    left: createPage4PanelEditorState(),
    right: createPage4PanelEditorState(),
  });
  const [spriteFilters, setSpriteFilters] = useState<Record<PanelSide, SpriteFilterState>>({
    left: createDefaultSpriteFilterState(),
    right: createDefaultSpriteFilterState(),
  });
  const [page4SpriteFilters, setPage4SpriteFilters] = useState<Record<PanelSide, SpriteFilterState>>({
    left: createDefaultSpriteFilterState(),
    right: createDefaultSpriteFilterState(),
  });
  const [sprites, setSprites] = useState<SpriteRecord[]>([]);
  const [createMatchOpen, setCreateMatchOpen] = useState(false);
  const [editingHistoryTagMatchId, setEditingHistoryTagMatchId] = useState<string | null>(null);
  const [editingHistoryTagValues, setEditingHistoryTagValues] = useState<string[]>([]);
  const [savingHistoryTagMatchId, setSavingHistoryTagMatchId] = useState<string | null>(null);
  const [selectedHistoryKeys, setSelectedHistoryKeys] = useState<React.Key[]>([]);
  const [expandedHistoryKeys, setExpandedHistoryKeys] = useState<React.Key[]>([]);
  const [historyTagFilter, setHistoryTagFilter] = useState<string | null>(null);
  const [previewSlot, setPreviewSlot] = useState<PreviewSlotKey>('page1');
  const [previewScale, setPreviewScale] = useState(1);
  const [previewShellSize, setPreviewShellSize] = useState({ width: 960, height: 540 });
  const [rosterNotice, setRosterNotice] = useState<NoticeState>(null);
  const [page4Notice, setPage4Notice] = useState<NoticeState>(null);
  const [historyNotice, setHistoryNotice] = useState<NoticeState>(null);
  const [liveNotice, setLiveNotice] = useState<NoticeState>(null);
  const [liveFilePath, setLiveFilePath] = useState<string | null>(null);
  const [liveFileName, setLiveFileName] = useState('');
  const [liveConfigEnabled, setLiveConfigEnabled] = useState(false);
  const [liveConfigLastModified, setLiveConfigLastModified] = useState<number | null>(null);
  const [liveConfigLastContent, setLiveConfigLastContent] = useState('');
  const [scoreboardForm] = Form.useForm<ScoreboardFormValues>();
  const [matchForm] = Form.useForm<MatchFormValues>();
  const [createMatchForm] = Form.useForm<CreateMatchValues>();

  const liveApplyRef = useRef(false);
  const liveWriteRef = useRef(false);
  const liveSaveTimerRef = useRef<number | null>(null);
  const livePollTimerRef = useRef<number | null>(null);
  const previewFrameShellRef = useRef<HTMLDivElement | null>(null);

  const spriteMap = buildSpriteLookup(sprites);
  const activeMatch = getActiveMatch(matchStore);
  const currentGame = getCurrentGame(activeMatch);
  const lineupLocked = activeMatch?.status === 'completed';
  const progress = buildProgressItems(activeMatch);
  const allHistoryTags = buildHistoryTags(matchStore.matches);
  const filteredMatches = historyTagFilter
    ? matchStore.matches.filter((match) => (match.tags ?? []).includes(historyTagFilter))
    : matchStore.matches;

  const deferredLeftSearch = useDeferredValue(panels.left.search);
  const deferredRightSearch = useDeferredValue(panels.right.search);
  const deferredPage4LeftSearch = useDeferredValue(page4Panels.left.search);
  const deferredPage4RightSearch = useDeferredValue(page4Panels.right.search);
  const spriteFormOptions = EXCLUSIVE_FORM_FILTERS.filter((form) => (
    sprites.some((sprite) => sprite.form.trim() === form)
  ));

  function setPanelState(side: PanelSide, nextState: PanelEditorState) {
    setPanels((prev) => ({
      ...prev,
      [side]: nextState,
    }));
  }

  function mutatePanel(side: PanelSide, updater: (panel: PanelEditorState) => PanelEditorState) {
    setPanels((prev) => ({
      ...prev,
      [side]: updater(prev[side]),
    }));
  }

  function mutateSpriteFilter(side: PanelSide, updater: (filter: SpriteFilterState) => SpriteFilterState) {
    setSpriteFilters((prev) => ({
      ...prev,
      [side]: updater(prev[side]),
    }));
  }

  function mutatePage4Panel(side: PanelSide, updater: (panel: Page4PanelEditorState) => Page4PanelEditorState) {
    setPage4Panels((prev) => ({
      ...prev,
      [side]: updater(prev[side]),
    }));
  }

  function mutatePage4SpriteFilter(side: PanelSide, updater: (filter: SpriteFilterState) => SpriteFilterState) {
    setPage4SpriteFilters((prev) => ({
      ...prev,
      [side]: updater(prev[side]),
    }));
  }

  function syncPanelFromApi(side: PanelSide, panel: PanelState | null | undefined) {
    setPanels((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        selected: panelStateToSelected(panel),
        dirty: false,
        saving: false,
      },
    }));
  }

  function syncPage4PanelFromApi(side: PanelSide, panel: Page4PanelState | null | undefined) {
    setPage4Panels((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        selected: page4PanelStateToSelected(panel),
        dirty: false,
        saving: false,
      },
    }));
  }

  function applyServerState(payload: {
    scoreboard?: ScoreboardState;
    matches?: MatchStoreState;
    background?: BackgroundState;
    avatars?: AvatarCollectionState;
    panels?: PanelState[];
    panel?: PanelState;
    page4?: Page4State;
    page4Panel?: Page4PanelState;
  }) {
    startTransition(() => {
      if (payload.scoreboard) {
        setScoreboard(payload.scoreboard);
      }
      if (payload.matches) {
        setMatchStore(payload.matches);
      }
      if (payload.background) {
        setBackground(payload.background);
      }
      if (payload.avatars) {
        setAvatars(payload.avatars);
      }
      if (Array.isArray(payload.panels)) {
        payload.panels.forEach((panel) => {
          if (panel.position === 'left' || panel.position === 'right') {
            syncPanelFromApi(panel.position, panel);
          }
        });
      }
      if (payload.panel && (payload.panel.position === 'left' || payload.panel.position === 'right')) {
        syncPanelFromApi(payload.panel.position, payload.panel);
      }
      if (payload.page4) {
        payload.page4.panels.forEach((panel) => {
          if (panel.position === 'left' || panel.position === 'right') {
            syncPage4PanelFromApi(panel.position, panel);
          }
        });
      }
      if (payload.page4Panel && (payload.page4Panel.position === 'left' || payload.page4Panel.position === 'right')) {
        syncPage4PanelFromApi(payload.page4Panel.position, payload.page4Panel);
      }
    });
  }

  async function loadInitialData(showToast = false) {
    setRefreshing(true);
    setPageError('');

    try {
      const [auth, nextScoreboard, nextMatches, nextBackground, nextAvatars, nextPanels, nextPage4, nextSprites] = await Promise.all([
        requestJson<{ authenticated: boolean }>('/api/auth/check'),
        requestJson<ScoreboardState>('/api/scoreboard'),
        requestJson<MatchStoreState>('/api/matches'),
        requestJson<BackgroundState>('/api/background'),
        requestJson<AvatarCollectionState>('/api/avatars'),
        requestJson<{ images: [PanelState, PanelState] }>('/api/images'),
        requestJson<Page4State>('/api/page4'),
        requestJson<{ sprites: SpriteRecord[] }>('/api/sprites'),
      ]);

      if (!auth.authenticated) {
        window.location.href = '/login.html';
        return;
      }

      startTransition(() => {
        setScoreboard(nextScoreboard);
        setMatchStore(nextMatches);
        setBackground(nextBackground);
        setAvatars(nextAvatars);
        setSprites(nextSprites.sprites);
        syncPanelFromApi('left', nextPanels.images[0]);
        syncPanelFromApi('right', nextPanels.images[1]);
        syncPage4PanelFromApi('left', nextPage4.panels[0]);
        syncPage4PanelFromApi('right', nextPage4.panels[1]);
      });

      if (showToast) {
        message.success('后台数据已刷新');
      }
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : String(error);
      if (nextMessage.includes('authenticated') || nextMessage.includes('请先登录')) {
        window.location.href = '/login.html';
        return;
      }
      setPageError(nextMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    if (!scoreboard) {
      return;
    }

    scoreboardForm.setFieldsValue({
      scoreboardEnabled: scoreboard.scoreboardEnabled,
      healthBadgeEnabled: scoreboard.healthBadgeEnabled,
      abilityBadgeEnabled: scoreboard.abilityBadgeEnabled,
      centerAreaEnabled: scoreboard.centerAreaEnabled,
      centerAreaColor: scoreboard.centerAreaColor,
      eventTitleEnabled: scoreboard.eventTitleEnabled,
      eventTitle: scoreboard.eventTitle,
      page2LineupDisplayMode: scoreboard.page2LineupDisplayMode,
      nameFontSize: scoreboard.nameFontSize,
      scoreFontSize: scoreboard.scoreFontSize,
    });
  }, [scoreboard, scoreboardForm]);

  useEffect(() => {
    if (!activeMatch) {
      matchForm.resetFields();
      return;
    }

    matchForm.setFieldsValue({
      leftPlayer: activeMatch.leftPlayer,
      rightPlayer: activeMatch.rightPlayer,
      bestOf: activeMatch.bestOf,
    });
  }, [activeMatch, matchForm]);

  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
    });

    socket.on(SOCKET_EVENTS.snapshot, (payload) => {
      applyServerState(payload ?? {});
    });

    socket.on(SOCKET_EVENTS.panelUpdate, (payload) => {
      if (payload?.panel) {
        applyServerState({ panel: payload.panel });
      }
    });

    socket.on(SOCKET_EVENTS.page4Update, (payload) => {
      if (payload?.page4) {
        applyServerState({ page4: payload.page4 });
      }
    });

    socket.on(SOCKET_EVENTS.scoreboardUpdate, (payload) => {
      if (payload?.scoreboard) {
        applyServerState({ scoreboard: payload.scoreboard });
      }
    });

    socket.on(SOCKET_EVENTS.matchesUpdate, (payload) => {
      if (payload?.matches) {
        applyServerState({ matches: payload.matches });
      }
    });

    socket.on(SOCKET_EVENTS.backgroundUpdate, (payload) => {
      if (payload?.background) {
        applyServerState({ background: payload.background });
      }
    });

    socket.on(SOCKET_EVENTS.avatarUpdate, (payload) => {
      if (payload?.avatars) {
        applyServerState({ avatars: payload.avatars });
      }
    });

    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    if (!panels.left.autoSaveEnabled || !panels.left.dirty) {
      return;
    }
    const timer = window.setTimeout(() => {
      void savePanel('left', true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [panels.left]);

  useEffect(() => {
    if (!panels.right.autoSaveEnabled || !panels.right.dirty) {
      return;
    }
    const timer = window.setTimeout(() => {
      void savePanel('right', true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [panels.right]);

  useEffect(() => {
    if (!page4Panels.left.autoSaveEnabled || !page4Panels.left.dirty) {
      return;
    }
    const timer = window.setTimeout(() => {
      void savePage4Panel('left', true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [page4Panels.left]);

  useEffect(() => {
    if (!page4Panels.right.autoSaveEnabled || !page4Panels.right.dirty) {
      return;
    }
    const timer = window.setTimeout(() => {
      void savePage4Panel('right', true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [page4Panels.right]);

  async function savePanel(side: PanelSide, silent = false) {
    if (lineupLocked) {
      const nextText = '当前赛事已完赛，不能编辑阵容';
      setRosterNotice({ tone: 'warning', text: nextText });
      if (!silent) {
        message.warning(nextText);
      }
      return;
    }

    const current = panels[side];
    mutatePanel(side, (panel) => ({ ...panel, saving: true }));
    try {
      const data = await requestJson<{ success: boolean; panel?: PanelState; matches?: MatchStoreState }>(`/api/panels/${side}`, {
        method: 'POST',
        json: {
          selected: buildPanelRequest(current.selected),
        },
      });
      applyServerState({
        panel: data.panel,
        matches: data.matches,
      });
      mutatePanel(side, (panel) => ({ ...panel, dirty: false, saving: false }));
      if (!silent) {
        const nextActiveMatch = data.matches ? getActiveMatch(data.matches) : activeMatch;
        const nextCurrentGame = getCurrentGame(nextActiveMatch);
        const nextText = nextCurrentGame?.status === 'in_progress'
          ? `${side === 'left' ? '左侧' : '右侧'}阵容已同步到当前对局与推流页面`
          : `${side === 'left' ? '左侧' : '右侧'}阵容草稿已保存，等待开始本局后同步前台`;
        setRosterNotice({ tone: 'success', text: nextText });
        message.success(nextText);
      }
    } catch (error) {
      mutatePanel(side, (panel) => ({ ...panel, saving: false }));
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function deletePanel(side: PanelSide) {
    try {
      const data = await requestJson<{ success: boolean; panel?: PanelState; matches?: MatchStoreState }>(`/api/panels/${side}`, {
        method: 'DELETE',
      });
      applyServerState({
        panel: data.panel,
        matches: data.matches,
      });
      mutatePanel(side, (panel) => ({
        ...panel,
        selected: Array.from({ length: 6 }, (_, index) => createEmptySlot(index)),
        quickFillMatches: [],
        dirty: false,
        activeSlot: 0,
      }));
      message.success(`${side === 'left' ? '左侧' : '右侧'}配置已删除`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function runQuickFill(side: PanelSide) {
    const text = panels[side].quickFillInput.trim();
    if (!text) {
      message.warning('先输入要匹配的精灵名称');
      return;
    }

    try {
      const data = await requestJson<{
        success: boolean;
        matches: QuickFillMatch[];
      }>('/api/quick-fill', {
        method: 'POST',
        json: { text },
      });

      const nextSelected = Array.from({ length: 6 }, (_, index) => createEmptySlot(index));
      data.matches.forEach((match) => {
        if (match.slot >= 0 && match.slot < 6 && match.sprite) {
          nextSelected[match.slot] = {
            ...nextSelected[match.slot],
            sprite: match.sprite,
          };
        }
      });

      mutatePanel(side, (panel) => ({
        ...panel,
        selected: nextSelected,
        quickFillMatches: data.matches,
        dirty: true,
      }));
      message.success(`${side === 'left' ? '左侧' : '右侧'}快速填充已应用到本地草稿`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  function chooseQuickFillCandidate(side: PanelSide, slotIndex: number, sprite: SpriteRecord) {
    mutatePanel(side, (panel) => {
      const selected = cloneSelected(panel.selected);
      selected[slotIndex] = {
        ...selected[slotIndex],
        sprite,
      };
      return {
        ...panel,
        selected,
        dirty: true,
      };
    });
  }

  function updateSlot(side: PanelSide, updater: (slot: SlotState) => SlotState) {
    mutatePanel(side, (panel) => {
      const selected = cloneSelected(panel.selected);
      const current = selected[panel.activeSlot] ?? createEmptySlot(panel.activeSlot);
      selected[panel.activeSlot] = updater(current);
      return {
        ...panel,
        selected,
        dirty: true,
      };
    });
  }

  function clearCurrentSlot(side: PanelSide) {
    mutatePanel(side, (panel) => {
      const selected = cloneSelected(panel.selected);
      selected[panel.activeSlot] = createEmptySlot(panel.activeSlot);
      return {
        ...panel,
        selected,
        dirty: true,
      };
    });
  }

  function clearPanel(side: PanelSide) {
    mutatePanel(side, (panel) => ({
      ...panel,
      selected: Array.from({ length: 6 }, (_, index) => createEmptySlot(index)),
      quickFillMatches: [],
      dirty: true,
    }));
  }

  function applySprite(side: PanelSide, sprite: SpriteRecord) {
    updateSlot(side, (slot) => ({
      ...slot,
      sprite,
    }));
  }

  function toggleAttributeFilter(side: PanelSide, attribute: string) {
    const current = spriteFilters[side].selectedAttributes;
    const isActive = current.includes(attribute);

    if (!isActive && current.length >= 2) {
      message.warning('精灵属性最多只能选择两个');
      return;
    }

    mutateSpriteFilter(side, (filter) => ({
      ...filter,
      selectedAttributes: isActive
        ? filter.selectedAttributes.filter((item) => item !== attribute)
        : [...filter.selectedAttributes, attribute],
    }));
  }

  function toggleFormFilter(side: PanelSide, form: string) {
    mutateSpriteFilter(side, (filter) => {
      if (filter.selectedFinalForm) {
        return filter;
      }

      return {
        ...filter,
        selectedForms: filter.selectedForms.includes(form)
          ? filter.selectedForms.filter((item) => item !== form)
          : [...filter.selectedForms, form],
      };
    });
  }

  function toggleFinalFormFilter(side: PanelSide) {
    mutateSpriteFilter(side, (filter) => ({
      ...filter,
      selectedFinalForm: !filter.selectedFinalForm,
      selectedForms: filter.selectedFinalForm ? filter.selectedForms : [],
    }));
  }

  function clearSpriteFilters(side: PanelSide) {
    setSpriteFilters((prev) => ({
      ...prev,
      [side]: createSpriteFilterState(),
    }));
  }

  async function savePage4Panel(side: PanelSide, silent = false) {
    const current = page4Panels[side];
    mutatePage4Panel(side, (panel) => ({ ...panel, saving: true }));

    try {
      const data = await requestJson<{ success: boolean; page4?: Page4State }>(`/api/page4/${side}`, {
        method: 'POST',
        json: {
          selected: buildPage4Request(current.selected),
        },
      });

      applyServerState({
        page4: data.page4,
      });
      mutatePage4Panel(side, (panel) => ({ ...panel, dirty: false, saving: false }));

      if (!silent) {
        const nextText = `${side === 'left' ? '左侧' : '右侧'} page4 阵容已保存`;
        setPage4Notice({ tone: 'success', text: nextText });
        message.success(nextText);
      }
    } catch (error) {
      mutatePage4Panel(side, (panel) => ({ ...panel, saving: false }));
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  function updatePage4Slot(side: PanelSide, updater: (slot: Page4SlotState) => Page4SlotState) {
    mutatePage4Panel(side, (panel) => {
      const selected = clonePage4Selected(panel.selected);
      const current = selected[panel.activeSlot] ?? createPage4EmptySlot(panel.activeSlot);
      selected[panel.activeSlot] = updater(current);
      return {
        ...panel,
        selected,
        dirty: true,
      };
    });
  }

  function clearPage4CurrentSlot(side: PanelSide) {
    mutatePage4Panel(side, (panel) => {
      const selected = clonePage4Selected(panel.selected);
      selected[panel.activeSlot] = createPage4EmptySlot(panel.activeSlot);
      return {
        ...panel,
        selected,
        dirty: true,
      };
    });
  }

  function clearPage4Panel(side: PanelSide) {
    mutatePage4Panel(side, (panel) => ({
      ...panel,
      selected: Array.from({ length: 6 }, (_, index) => createPage4EmptySlot(index)),
      dirty: true,
    }));
  }

  function applyPage4Sprite(side: PanelSide, sprite: SpriteRecord) {
    updatePage4Slot(side, (slot) => ({
      ...slot,
      sprite,
    }));
  }

  function togglePage4Dead(side: PanelSide) {
    updatePage4Slot(side, (slot) => ({
      ...slot,
      isDead: !slot.isDead,
    }));
  }

  function togglePage4AttributeFilter(side: PanelSide, attribute: string) {
    const current = page4SpriteFilters[side].selectedAttributes;
    const isActive = current.includes(attribute);

    if (!isActive && current.length >= 2) {
      message.warning('精灵属性最多只能选择两个');
      return;
    }

    mutatePage4SpriteFilter(side, (filter) => ({
      ...filter,
      selectedAttributes: isActive
        ? filter.selectedAttributes.filter((item) => item !== attribute)
        : [...filter.selectedAttributes, attribute],
    }));
  }

  function togglePage4FormFilter(side: PanelSide, form: string) {
    mutatePage4SpriteFilter(side, (filter) => {
      if (filter.selectedFinalForm) {
        return filter;
      }

      return {
        ...filter,
        selectedForms: filter.selectedForms.includes(form)
          ? filter.selectedForms.filter((item) => item !== form)
          : [...filter.selectedForms, form],
      };
    });
  }

  function togglePage4FinalFormFilter(side: PanelSide) {
    mutatePage4SpriteFilter(side, (filter) => ({
      ...filter,
      selectedFinalForm: !filter.selectedFinalForm,
      selectedForms: filter.selectedFinalForm ? filter.selectedForms : [],
    }));
  }

  function clearPage4SpriteFilters(side: PanelSide) {
    setPage4SpriteFilters((prev) => ({
      ...prev,
      [side]: createSpriteFilterState(),
    }));
  }

  async function saveMatchMeta(values: MatchFormValues) {
    if (!activeMatch) {
      return;
    }

    const nextBestOf = Number(values.bestOf) || activeMatch.bestOf;
    const bestOfChanged = nextBestOf !== activeMatch.bestOf;
    const projection = bestOfChanged ? summarizeSeriesForBestOf(activeMatch, nextBestOf) : null;
    const endsMatchAfterBestOfChange = Boolean(projection?.winner && activeMatch.status !== 'completed');

    const save = async () => {
      try {
        const data = await requestJson<{ success: boolean; matches?: MatchStoreState; scoreboard?: ScoreboardState }>(`/api/matches/${encodeURIComponent(activeMatch.id)}`, {
          method: 'PATCH',
          json: values,
        });
        applyServerState({
          matches: data.matches,
          scoreboard: data.scoreboard,
        });

        if (endsMatchAfterBestOfChange && projection?.winner) {
          const winnerText = projection.winner === 'left'
            ? (values.leftPlayer || '左侧')
            : (values.rightPlayer || '右侧');
          const nextText = `BO 已改为 BO${nextBestOf}，本场比赛按已录入结果直接结束，${winnerText} 以 ${projection.leftScore}:${projection.rightScore} 获胜`;
          setRosterNotice({ tone: 'warning', text: nextText });
          message.success(nextText);
          return;
        }

        if (bestOfChanged) {
          const nextText = `比赛信息已保存，BO 已更新为 BO${nextBestOf}`;
          setRosterNotice({ tone: 'success', text: nextText });
          message.success(nextText);
          return;
        }

        setRosterNotice({ tone: 'success', text: '比赛信息已保存' });
        message.success('比赛信息已保存');
      } catch (error) {
        message.error(error instanceof Error ? error.message : String(error));
      }
    };

    if (endsMatchAfterBestOfChange && projection?.winner) {
      const winnerText = projection.winner === 'left'
        ? (values.leftPlayer || '左侧')
        : (values.rightPlayer || '右侧');
      modal.confirm({
        title: '修改 BO 会直接结束本场比赛',
        content: `当前已录入的战绩在 BO${nextBestOf} 下已经足以分出胜负。继续后会立即结束本场比赛，并按前 ${projection.completedGameCount} 局结算为 ${winnerText} ${projection.leftScore}:${projection.rightScore} 获胜。`,
        okText: '确认并结束比赛',
        cancelText: '取消',
        onOk: save,
      });
      return;
    }

    await save();
  }

  async function selectMatch(matchId: string) {
    try {
      const data = await requestJson<{ success: boolean; matches?: MatchStoreState; scoreboard?: ScoreboardState; panels?: PanelState[] }>(`/api/matches/${encodeURIComponent(matchId)}/select`, {
        method: 'POST',
      });
      applyServerState({
        matches: data.matches,
        scoreboard: data.scoreboard,
        panels: data.panels,
      });
      setView('roster');
      const nextStore = data.matches ?? matchStore;
      const nextActiveMatch = getActiveMatch(nextStore);
      const nextText = nextActiveMatch?.status === 'completed'
        ? `已切换到赛事 ${matchId}，比赛已完成，阵容不可编辑`
        : `已切换到赛事 ${matchId}`;
      setRosterNotice({ tone: nextActiveMatch?.status === 'completed' ? 'warning' : 'success', text: nextText });
      if (nextActiveMatch?.status === 'completed') {
        message.warning(nextText);
      } else {
        message.success(nextText);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function createMatch(values: CreateMatchValues) {
    try {
      const data = await requestJson<{ success: boolean; matches?: MatchStoreState; scoreboard?: ScoreboardState; panels?: PanelState[] }>('/api/matches', {
        method: 'POST',
        json: {
          ...values,
          tags: values.tags ?? [],
        },
      });
      applyServerState({
        matches: data.matches,
        scoreboard: data.scoreboard,
        panels: data.panels,
      });
      setCreateMatchOpen(false);
      createMatchForm.resetFields();
      setRosterNotice({ tone: 'success', text: '新赛事已创建，系统已自动切到第 1 局草稿' });
      message.success('新赛事已创建');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteHistoryMatches(matchIds: string[]) {
    if (!matchIds.length) {
      return;
    }

    try {
      const data = await requestJson<{ success: boolean; matches?: MatchStoreState; scoreboard?: ScoreboardState; panels?: PanelState[] }>('/api/matches/history/delete', {
        method: 'POST',
        json: { matchIds },
      });
      applyServerState({
        matches: data.matches,
        scoreboard: data.scoreboard,
        panels: data.panels,
      });
      setSelectedHistoryKeys([]);
      setHistoryNotice({ tone: 'success', text: `已删除 ${matchIds.length} 场赛事` });
      message.success(`已删除 ${matchIds.length} 场赛事`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function undoDeletedHistoryMatches() {
    try {
      const data = await requestJson<{ success: boolean; matches?: MatchStoreState; scoreboard?: ScoreboardState; panels?: PanelState[] }>('/api/matches/history/undo-delete', {
        method: 'POST',
      });
      applyServerState({
        matches: data.matches,
        scoreboard: data.scoreboard,
        panels: data.panels,
      });
      setHistoryNotice({ tone: 'success', text: '已恢复最近一次删除的赛事记录' });
      message.success('最近删除的赛事已恢复');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function runMatchAction(action: 'start' | 'undo' | 'redo' | 'winner', extra?: Record<string, unknown>) {
    if (!activeMatch) {
      return;
    }

    try {
      const data = await requestJson<{ success: boolean; matches?: MatchStoreState; scoreboard?: ScoreboardState; panels?: PanelState[] }>(
        `/api/matches/${encodeURIComponent(activeMatch.id)}/${action}`,
        {
          method: 'POST',
          json: extra,
        },
      );
      applyServerState({
        matches: data.matches,
        scoreboard: data.scoreboard,
        panels: data.panels,
      });

      const nextStore = data.matches ?? matchStore;
      const nextMatch = getActiveMatch(nextStore);
      if (action === 'start') {
        const nextText = '本局已开始，后续仍可继续编辑阵容、血量与能量值';
        setRosterNotice({ tone: 'success', text: nextText });
        message.success(nextText);
        return;
      }
      if (action === 'undo') {
        const nextText = '已撤回上一步操作';
        setRosterNotice({ tone: 'success', text: nextText });
        message.success(nextText);
        return;
      }
      if (action === 'redo') {
        const nextText = '已恢复刚刚撤回的操作';
        setRosterNotice({ tone: 'success', text: nextText });
        message.success(nextText);
        return;
      }
      if (action === 'winner') {
        const winner = extra?.winner === 'left' || extra?.winner === 'right' ? extra.winner : null;
        const sideText = winner === 'left' ? '左侧' : '右侧';
        const nextText = nextMatch?.status === 'completed'
          ? `比赛已结束，${sideText}拿下系列赛`
          : `已记录${sideText}本局获胜，下一局等待开始`;
        setRosterNotice({ tone: 'success', text: nextText });
        message.success(nextText);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveScoreboardSettings(values: ScoreboardFormValues) {
    if (!scoreboard) {
      return;
    }

    try {
      const data = await requestJson<{ success: boolean; scoreboard: ScoreboardState }>('/api/scoreboard', {
        method: 'POST',
        json: {
          leftName: scoreboard.leftName,
          leftScore: scoreboard.leftScore,
          rightName: scoreboard.rightName,
          rightScore: scoreboard.rightScore,
          bestOf: scoreboard.bestOf,
          ...values,
        },
      });
      applyServerState({ scoreboard: data.scoreboard });
      message.success('显示设置已保存');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveMatchTags(matchId: string, tags: string[]) {
    const nextTags = Array.from(new Set(tags.map((item) => item.trim()).filter(Boolean))).slice(0, 10);

    setSavingHistoryTagMatchId(matchId);
    try {
      const data = await requestJson<{ success: boolean; matches?: MatchStoreState }>(`/api/matches/${encodeURIComponent(matchId)}/tags`, {
        method: 'PATCH',
        json: { tags: nextTags },
      });
      applyServerState({ matches: data.matches });
      setEditingHistoryTagMatchId(null);
      setEditingHistoryTagValues([]);
      setHistoryNotice({ tone: 'success', text: '标签已更新' });
      message.success('标签已保存');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingHistoryTagMatchId(null);
    }
  }

  function beginInlineTagEdit(match: MatchRecord) {
    setEditingHistoryTagMatchId(match.id);
    setEditingHistoryTagValues(match.tags ?? []);
  }

  function cancelInlineTagEdit() {
    setEditingHistoryTagMatchId(null);
    setEditingHistoryTagValues([]);
  }

  async function commitInlineTagEdit(matchId: string) {
    if (savingHistoryTagMatchId === matchId) {
      return;
    }

    await saveMatchTags(matchId, editingHistoryTagValues);
  }

  async function removeMatchTag(record: MatchRecord, tagValue: string) {
    const tags = (record.tags ?? []).filter((tag) => tag !== tagValue);

    await saveMatchTags(record.id, tags);
    setHistoryNotice({ tone: 'success', text: `已从 ${record.id} 删除标签“${tagValue}”` });
    message.success('标签已删除');
  }

  async function uploadBackgroundFile(file: File) {
    try {
      const data = await uploadSingleFile<BackgroundState & { success: boolean }>('/api/upload/background', file);
      setBackground(data);
      message.success('背景图已更新');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteBackgroundFile() {
    try {
      const data = await requestJson<{ success: boolean; background: BackgroundState }>('/api/delete/background', {
        method: 'DELETE',
      });
      setBackground(data.background);
      message.success('背景图已删除');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function uploadAvatarFile(side: PanelSide, file: File) {
    try {
      await uploadSingleFile(`/api/upload/avatar/${side}`, file);
      const nextAvatars = await requestJson<AvatarCollectionState>('/api/avatars');
      setAvatars(nextAvatars);
      message.success(`${side === 'left' ? '左侧' : '右侧'}头像已更新`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteAvatarFile(side: PanelSide) {
    try {
      await requestJson(`/api/delete/avatar/${side}`, {
        method: 'DELETE',
      });
      const nextAvatars = await requestJson<AvatarCollectionState>('/api/avatars');
      setAvatars(nextAvatars);
      message.success(`${side === 'left' ? '左侧' : '右侧'}头像已删除`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCopyLocalAddress() {
    try {
      await copyText(getLocalAddressText(previewSlot));
      message.success('本地地址已复制');
    } catch {
      message.error('复制失败，请手动复制');
    }
  }

  async function handleCopyPreviewLink() {
    try {
      await copyText(buildPreviewUrl(previewSlot));
      message.success('预览链接已复制');
    } catch {
      message.error('复制失败，请手动复制');
    }
  }

  function clearLivePollTimer() {
    if (livePollTimerRef.current !== null) {
      window.clearInterval(livePollTimerRef.current);
      livePollTimerRef.current = null;
    }
  }

  function clearLiveSaveTimer() {
    if (liveSaveTimerRef.current !== null) {
      window.clearTimeout(liveSaveTimerRef.current);
      liveSaveTimerRef.current = null;
    }
  }

  async function verifyFilePermission(fileHandle: {
    queryPermission?: (options?: unknown) => Promise<string>;
    requestPermission?: (options?: unknown) => Promise<string>;
  }, mode: 'read' | 'readwrite' = 'read') {
    if (!fileHandle || typeof fileHandle.queryPermission !== 'function') {
      return true;
    }

    const options = { mode };
    if ((await fileHandle.queryPermission(options)) === 'granted') {
      return true;
    }
    if (typeof fileHandle.requestPermission !== 'function') {
      return false;
    }
    return (await fileHandle.requestPermission(options)) === 'granted';
  }

  function downloadLiveConfig(text: string) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'roco-live-config.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function getLiveConfigFileName(filePath: string) {
    return String(filePath || '').split(/[\\/]/).pop() || 'roco-live-config.json';
  }

  async function writeLiveConfigToPath(filePath: string, text: string, notice?: string) {
    if (!window.rocoDesktop?.writeTextFile || !window.rocoDesktop?.statFile) {
      throw new Error('当前环境不支持写入监听文件');
    }

    liveWriteRef.current = true;
    try {
      await window.rocoDesktop.writeTextFile(filePath, text);
      const stat = await window.rocoDesktop.statFile(filePath);
      setLiveConfigLastModified(stat.mtimeMs);
      setLiveConfigLastContent(text);
      if (notice) {
        setLiveNotice({ tone: 'success', text: notice });
      }
    } finally {
      liveWriteRef.current = false;
    }
  }

  async function saveLivePanelsSilently(nextPanels: Record<PanelSide, PanelEditorState>) {
    const [leftData, rightData] = await Promise.all([
      requestJson<{ success: boolean; panel?: PanelState; matches?: MatchStoreState }>('/api/panels/left', {
        method: 'POST',
        json: { selected: buildPanelRequest(nextPanels.left.selected) },
      }),
      requestJson<{ success: boolean; panel?: PanelState; matches?: MatchStoreState }>('/api/panels/right', {
        method: 'POST',
        json: { selected: buildPanelRequest(nextPanels.right.selected) },
      }),
    ]);

    applyServerState({
      panel: rightData.panel,
      panels: [leftData.panel, rightData.panel].filter(Boolean) as PanelState[],
      matches: rightData.matches ?? leftData.matches,
    });
  }

  async function applyLiveConfigText(text: string, source = '监听文件') {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`${source} JSON 格式错误`);
    }

    liveApplyRef.current = true;
    try {
      let changed = false;
      const nextPanels: Record<PanelSide, PanelEditorState> = {
        left: { ...panels.left, selected: cloneSelected(panels.left.selected) },
        right: { ...panels.right, selected: cloneSelected(panels.right.selected) },
      };

      (['left', 'right'] as PanelSide[]).forEach((panel) => {
        const panelItems = extractLiveConfigPanel(payload, panel);
        if (!Array.isArray(panelItems)) {
          return;
        }

        const usedIndexes = new Set<number>();
        panelItems.slice(0, 6).forEach((rawItem, fallbackIndex) => {
          if (!rawItem || typeof rawItem !== 'object') {
            return;
          }

          const item = rawItem as Record<string, unknown>;
          const targetIndex = findConfigTargetIndex(panel, item, fallbackIndex, usedIndexes, nextPanels);
          if (targetIndex < 0 || targetIndex >= 6) {
            return;
          }
          usedIndexes.add(targetIndex);

          const slot = { ...nextPanels[panel].selected[targetIndex] };
          const hp = readNumberField(item, ['HP', 'hp', 'healthPercent', 'health'], 0, 100);
          const value = readNumberField(item, ['value', 'energyValue', 'energy'], 0, 10);

          if (hp !== null && slot.healthPercent !== hp) {
            slot.healthPercent = hp;
            changed = true;
          }
          if (value !== null && slot.energyValue !== value) {
            slot.energyValue = value;
            changed = true;
          }

          nextPanels[panel].selected[targetIndex] = slot;
        });
      });

      if (!changed) {
        setLiveNotice({ tone: 'info', text: `${source}无变化` });
        return;
      }

      startTransition(() => {
        setPanels(nextPanels);
      });
      await saveLivePanelsSilently(nextPanels);
      setLiveNotice({ tone: 'success', text: `已根据${source}更新` });
    } finally {
      liveApplyRef.current = false;
    }
  }

  async function pollLiveConfigFile() {
    if (!liveConfigEnabled || !liveFilePath || liveWriteRef.current) {
      return;
    }
    if (!window.rocoDesktop?.readTextFile || !window.rocoDesktop?.statFile) {
      return;
    }

    try {
      const [text, stat] = await Promise.all([
        window.rocoDesktop.readTextFile(liveFilePath),
        window.rocoDesktop.statFile(liveFilePath),
      ]);
      if (text === liveConfigLastContent || stat.mtimeMs === liveConfigLastModified) {
        return;
      }
      setLiveConfigLastModified(stat.mtimeMs);
      setLiveConfigLastContent(text);
      await applyLiveConfigText(text, '监听文件');
    } catch (error) {
      setLiveNotice({ tone: 'error', text: error instanceof Error ? error.message : '监听文件读取失败' });
    }
  }

  async function handleExportLiveConfig() {
    const text = stringifyLiveConfig(panels);

    try {
      if (typeof window.showSaveFilePicker === 'function') {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: 'roco-live-config.json',
          types: [{ description: 'JSON 文件', accept: { 'application/json': ['.json'] } }],
        });
        if (!(await verifyFilePermission(fileHandle, 'readwrite'))) {
          throw new Error('没有导出文件的写入权限');
        }
        const writable = await fileHandle.createWritable();
        await writable.write(text);
        await writable.close();
        setLiveNotice({ tone: 'success', text: '配置导出成功' });
        return;
      }

      if (window.rocoDesktop?.showSaveDialog && window.rocoDesktop?.writeTextFile) {
        const filePath = await window.rocoDesktop.showSaveDialog();
        if (!filePath) {
          setLiveNotice({ tone: 'info', text: '已取消配置导出' });
          return;
        }
        await window.rocoDesktop.writeTextFile(filePath, text);
        setLiveNotice({ tone: 'success', text: '配置导出成功' });
        return;
      }

      downloadLiveConfig(text);
      setLiveNotice({ tone: 'success', text: '配置已下载' });
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        setLiveNotice({ tone: 'info', text: '已取消配置导出' });
        return;
      }
      setLiveNotice({ tone: 'error', text: error instanceof Error ? error.message : '配置导出失败' });
    }
  }

  async function startLiveConfigWatch() {
    try {
      let filePath: string | null = null;

      if (window.rocoDesktop?.showOpenDialog) {
        filePath = await window.rocoDesktop.showOpenDialog();
      }

      if (!filePath) {
        setLiveNotice({ tone: 'info', text: '已取消实时监听' });
        return;
      }
      await startLiveConfigWatchFromPath(filePath);
    } catch (error) {
      stopLiveConfigWatch(false);
      setLiveNotice({ tone: 'error', text: error instanceof Error ? error.message : '实时监听开启失败' });
    }
  }

  async function startLiveConfigWatchFromPath(filePath: string) {
    if (!window.rocoDesktop?.readTextFile || !window.rocoDesktop?.statFile) {
      throw new Error('当前环境不支持实时监听');
    }

    const [text, stat] = await Promise.all([
      window.rocoDesktop.readTextFile(filePath),
      window.rocoDesktop.statFile(filePath),
    ]);

    setLiveFilePath(filePath);
    setLiveFileName(getLiveConfigFileName(filePath));
    setLiveConfigEnabled(true);
    setLiveConfigLastModified(stat.mtimeMs);
    setLiveConfigLastContent(text);

    if (text.trim()) {
      await applyLiveConfigText(text, '监听文件');
    } else {
      await writeLiveConfigToPath(filePath, stringifyLiveConfig(panels), `监听中：${getLiveConfigFileName(filePath)}`);
    }

    clearLivePollTimer();
    livePollTimerRef.current = window.setInterval(() => {
      void pollLiveConfigFile();
    }, 1000);
    setLiveNotice({ tone: 'success', text: `实时监听已开启：${getLiveConfigFileName(filePath)}` });
  }

  async function handleLiveConfigUpload(file: File & { path?: string }) {
    try {
      const uploadPath = typeof file.path === 'string' && file.path.trim() ? file.path.trim() : null;

      if (uploadPath) {
        await startLiveConfigWatchFromPath(uploadPath);
        return false;
      }

      if (window.rocoDesktop?.showOpenDialog) {
        const filePath = await window.rocoDesktop.showOpenDialog();
        if (!filePath) {
          setLiveNotice({ tone: 'info', text: '已取消实时监听' });
          return false;
        }
        await startLiveConfigWatchFromPath(filePath);
        return false;
      }

      const text = await file.text();
      await applyLiveConfigText(text, '上传文件');
      setLiveNotice({ tone: 'warning', text: '当前环境仅应用了上传内容，无法持续监听该文件' });
      return false;
    } catch (error) {
      stopLiveConfigWatch(false);
      setLiveNotice({ tone: 'error', text: error instanceof Error ? error.message : '实时监听开启失败' });
      return false;
    }
  }

  function stopLiveConfigWatch(shouldResetNotice = true) {
    clearLivePollTimer();
    clearLiveSaveTimer();
    liveApplyRef.current = false;
    liveWriteRef.current = false;
    setLiveConfigEnabled(false);
    setLiveFilePath(null);
    setLiveFileName('');
    setLiveConfigLastModified(null);
    setLiveConfigLastContent('');
    if (shouldResetNotice) {
      setLiveNotice({ tone: 'info', text: '实时监听已关闭' });
    }
  }

  function scheduleLiveConfigWrite(reason = '已同步到监听文件') {
    if (!liveConfigEnabled || !liveFilePath || liveApplyRef.current) {
      return;
    }
    clearLiveSaveTimer();
    liveSaveTimerRef.current = window.setTimeout(() => {
      void writeLiveConfigToPath(liveFilePath, stringifyLiveConfig(panels), reason).catch((error) => {
        setLiveNotice({ tone: 'error', text: error instanceof Error ? error.message : '监听文件写入失败' });
      });
    }, 250);
  }

  function handleLiveConfigWatchToggle() {
    if (liveConfigEnabled) {
      stopLiveConfigWatch(true);
      return;
    }
    void startLiveConfigWatch();
  }

  async function saveLiveField(side: PanelSide, slotIndex: number, field: LiveField, value: number) {
    const selected = cloneSelected(panels[side].selected);
    const target = { ...selected[slotIndex] };
    if (field === 'healthPercent') {
      target.healthPercent = clampNumber(Math.round(value), 0, 100);
    } else {
      target.energyValue = clampNumber(Math.round(value), 0, 10);
    }
    selected[slotIndex] = target;

    const nextPanels = {
      ...panels,
      [side]: {
        ...panels[side],
        selected,
      },
    };

    startTransition(() => {
      setPanels(nextPanels);
    });

    try {
      await requestJson<{ success: boolean; panel?: PanelState; matches?: MatchStoreState }>(`/api/panels/${side}/slots/${slotIndex}`, {
        method: 'PATCH',
        json: {
          slot: buildPanelRequest(selected)[slotIndex],
        },
      });
      scheduleLiveConfigWrite();
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
      void loadInitialData();
    }
  }

  useEffect(() => {
    return () => {
      clearLivePollTimer();
      clearLiveSaveTimer();
    };
  }, []);

  useEffect(() => {
    const shell = previewFrameShellRef.current;
    if (!shell || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updatePreviewLayout = () => {
      const rect = shell.getBoundingClientRect();
      const availableHeight = Math.max(320, Math.floor(window.innerHeight - rect.top - 24));
      const availableWidth = shell.clientWidth;

      if (!availableWidth || !availableHeight) {
        return;
      }

      const nextScale = Math.min(availableWidth / 1920, availableHeight / 1080, 1);
      const nextWidth = Math.floor(1920 * nextScale);
      const nextHeight = Math.floor(1080 * nextScale);

      setPreviewShellSize({ width: nextWidth, height: nextHeight });
      setPreviewScale(nextScale > 0 ? nextScale : 1);
    };

    updatePreviewLayout();
    const observer = new ResizeObserver(() => updatePreviewLayout());
    observer.observe(shell);

    window.addEventListener('resize', updatePreviewLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePreviewLayout);
    };
  }, [previewSlot]);

  if (loading) {
    return (
      <div className="admin-antd-loading">
        <Spin size="large" />
        <Text>正在加载新的 Ant Design 后台...</Text>
      </div>
    );
  }

  const menuItems: MenuProps['items'] = [
    { key: 'roster', label: '赛事面板' },
    { key: 'live', label: '实时控制' },
    { key: 'page4', label: 'page4 展示' },
    { key: 'history', label: '比赛历史' },
    { key: 'scoreboard', label: '显示设置' },
    { key: 'background', label: '背景素材' },
    { key: 'preview', label: '页面预览' },
    { key: 'about', label: '关于项目' },
  ];

  const historyColumns: ColumnsType<MatchRecord> = [
    {
      title: '左侧选手',
      dataIndex: 'leftPlayer',
      key: 'leftPlayer',
      render: (value: MatchRecord['leftPlayer']) => <Text strong>{value || '左侧'}</Text>,
    },
    {
      title: '比分',
      key: 'score',
      render: (_: unknown, record: MatchRecord) => (
        <Text strong>{record.leftScore} : {record.rightScore}</Text>
      ),
    },
    {
      title: '右侧选手',
      dataIndex: 'rightPlayer',
      key: 'rightPlayer',
      render: (value: MatchRecord['rightPlayer']) => <Text strong>{value || '右侧'}</Text>,
    },
    {
      title: '赛制',
      dataIndex: 'bestOf',
      key: 'bestOf',
      render: (value: MatchRecord['bestOf']) => <Tag color="gold">BO{value}</Tag>,
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      render: (tags: string[], record: MatchRecord) => (
        editingHistoryTagMatchId === record.id ? (
          <Select
            mode="multiple"
            autoFocus
            value={editingHistoryTagValues}
            options={allHistoryTags.map((tag) => ({ value: tag, label: tag }))}
            placeholder="选择标签"
            className="history-tag-select"
            open
            loading={savingHistoryTagMatchId === record.id}
            onChange={(values) => setEditingHistoryTagValues(values)}
            onBlur={() => void commitInlineTagEdit(record.id)}
            onDropdownVisibleChange={(open) => {
              if (!open) {
                void commitInlineTagEdit(record.id);
              }
            }}
          />
        ) : (
          <div className="history-tag-cell" onClick={() => beginInlineTagEdit(record)} role="button" tabIndex={0} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              beginInlineTagEdit(record);
            }
          }}>
            <Space wrap>
              {tags?.length ? tags.map((tag) => (
                <Tag
                  key={`${record.id}-${tag}`}
                  color={historyTagFilter === tag ? 'processing' : DEFAULT_TAGS.includes(tag) ? 'gold' : 'default'}
                  onClick={(event) => {
                    event.stopPropagation();
                    setHistoryTagFilter(tag);
                  }}
                >
                  {tag}
                </Tag>
              )) : <Text type="secondary">点击选择标签</Text>}
            </Space>
          </div>
        )
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: MatchRecord['status']) => <Tag color={getMatchStatusColor(status)}>{getMatchStatusLabel(status)}</Tag>,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (value: MatchRecord['updatedAt']) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: MatchRecord) => (
        <Space wrap>
          <Button size="small" onClick={() => void selectMatch(record.id)}>进入管理</Button>
          <Button
            size="small"
            danger
            onClick={() => {
              modal.confirm({
                title: '删除这场赛事？',
                content: `${record.leftPlayer || '左侧'} vs ${record.rightPlayer || '右侧'}`,
                onOk: () => deleteHistoryMatches([record.id]),
              });
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  function renderPanelEditor(side: PanelSide) {
    const panel = panels[side];
    const filter = spriteFilters[side];
    const panelLocked = lineupLocked;
    const searchValue = side === 'left' ? deferredLeftSearch : deferredRightSearch;
    const filteredSprites = sprites.filter((sprite) => {
      const keyword = searchValue.trim().toLowerCase();
      const values = [
        sprite.displayName,
        sprite.name,
        sprite.chineseName,
        sprite.filename,
        ...(sprite.aliases ?? []),
      ];
      const matchesKeyword = !keyword || values.some((value) => String(value ?? '').toLowerCase().includes(keyword));
      const spriteAttributes = splitSpriteAttributes(sprite.attribute);
      const matchesAttributes = !filter.selectedAttributes.length
        || filter.selectedAttributes.every((attribute) => spriteAttributes.includes(attribute));
      const matchesForms = filter.selectedFinalForm
        ? sprite.isFinalForm
        : !filter.selectedForms.length || filter.selectedForms.includes(sprite.form);

      return matchesKeyword && matchesAttributes && matchesForms;
    });
    const hasFilter = filter.selectedAttributes.length > 0 || filter.selectedForms.length > 0 || filter.selectedFinalForm;

    return (
      <Card
        className="panel-editor-card"
        title={`${side === 'left' ? '左侧' : '右侧'}当前阵容`}
        extra={(
          <Space wrap>
            <Text type="secondary">已选 {summarizePanelSlots(panel.selected).selectedCount} / 6</Text>
            <Switch
              checked={panel.autoSaveEnabled}
              checkedChildren="自动保存"
              unCheckedChildren="手动保存"
              disabled={panelLocked}
              onChange={(checked) => mutatePanel(side, (prev) => ({ ...prev, autoSaveEnabled: checked }))}
            />
            {panel.saving ? <Tag color="processing">保存中</Tag> : null}
            {panelLocked ? <Tag color="warning">已锁定</Tag> : null}
          </Space>
        )}
      >
        <div className={`panel-editor-layout panel-editor-layout-${side}`}>
          <div className={`panel-slot-rail panel-slot-rail-${side}`}>
            <div className={`panel-slot-grid panel-slot-grid-${side}`}>
              {panel.selected.map((slot, index) => (
                <Button
                  key={`${side}-${index}`}
                  type={index === panel.activeSlot ? 'primary' : 'default'}
                  className={`slot-button slot-button-${side}`}
                  disabled={panelLocked}
                  onClick={() => mutatePanel(side, (prev) => ({ ...prev, activeSlot: index }))}
                >
                  <div className={`slot-button-inner slot-button-inner-${side}`}>
                    {slot.sprite?.path ? (
                      <SpritePetCard sprite={slot.sprite} size={96} />
                    ) : (
                      <div className="slot-placeholder">{index + 1}</div>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </div>

          <div className="panel-editor-main">
            <div className="panel-editor-tools">
              <Card size="small" className="subtle-card">
                <Space direction="vertical" size={12} className="control-stack">
                  {panelLocked ? (
                    <Alert
                      showIcon
                      type="warning"
                      message="当前赛事已完成，阵容编辑已锁定"
                    />
                  ) : null}
                  <div>
                    <Text strong>快速文本填充</Text>
                    <Paragraph type="secondary">一行一个精灵名，先生成本地草稿，再保存到阵容。</Paragraph>
                  </div>
                  <TextArea
                    disabled={panelLocked}
                    rows={4}
                    value={panel.quickFillInput}
                    onChange={(event) => mutatePanel(side, (prev) => ({ ...prev, quickFillInput: event.target.value }))}
                    placeholder={'暮星辰\n怖哭菇\n龙息帕尔'}
                  />
                  <Space wrap>
                    <Button disabled={panelLocked} onClick={() => void runQuickFill(side)}>快速填充</Button>
                    <Button disabled={panelLocked} type="primary" onClick={() => void savePanel(side)}>保存到{side === 'left' ? '左侧' : '右侧'}</Button>
                    <Button disabled={panelLocked} onClick={() => clearCurrentSlot(side)}>选中清除</Button>
                    <Button disabled={panelLocked} onClick={() => clearPanel(side)}>清除全部</Button>
                  </Space>
                </Space>
              </Card>

              {panel.quickFillMatches.some((match) => match.candidates.length > 1) ? (
                <Card size="small" className="subtle-card">
                  <Space direction="vertical" size={12} className="control-stack">
                    <Text strong>候选精灵选择</Text>
                    {panel.quickFillMatches
                      .filter((match) => match.candidates.length > 1)
                      .map((match) => (
                        <div key={`${side}-quick-${match.slot}`} className="quick-fill-group">
                          <Text>槽位 {match.slot + 1}</Text>
                          <div className="quick-fill-candidate-grid">
                            {match.candidates.map((candidate) => (
                              <Button
                                key={candidate.id}
                                size="small"
                                className="quick-fill-candidate-button"
                                disabled={panelLocked}
                                title={candidate.displayName}
                                aria-label={`选择 ${candidate.displayName}`}
                                onClick={() => chooseQuickFillCandidate(side, match.slot, candidate)}
                              >
                                <SpritePetCard sprite={candidate} size={64} className="quick-fill-candidate-card" />
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}
                  </Space>
                </Card>
              ) : null}
            </div>

            <Card size="small" className="subtle-card sprite-picker-card">
              <div className="sprite-picker-shell">
                <div className="sprite-filter-panel">
                  <div className="sprite-filter-header">
                    <Text strong>筛选精灵</Text>
                    {hasFilter ? (
                      <Button size="small" type="link" onClick={() => clearSpriteFilters(side)}>
                        清空筛选
                      </Button>
                    ) : null}
                  </div>
                  <div className="sprite-filter-group">
                    <Text type="secondary" className="sprite-filter-label">精灵属性（最多 2 个）</Text>
                    <div className="attribute-filter-grid">
                      {ATTRIBUTE_OPTIONS.map((option) => {
                        const active = filter.selectedAttributes.includes(option.label);
                        return (
                          <Button
                            key={`${side}-attr-${option.code}`}
                            type={active ? 'primary' : 'default'}
                            className={`attribute-filter-chip${active ? ' is-active' : ''}`}
                            title={option.label}
                            aria-label={option.label}
                            onClick={() => toggleAttributeFilter(side, option.label)}
                          >
                            <span className="attribute-filter-chip-inner">
                              <img
                                src={option.iconPath}
                                alt=""
                                className="attribute-filter-icon"
                              />
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="sprite-filter-group">
                    <Text type="secondary" className="sprite-filter-label">精灵形态</Text>
                    <Space wrap size={[8, 8]}>
                      <Button
                        key={`${side}-form-${FINAL_FORM_FILTER_LABEL}`}
                        size="small"
                        type={filter.selectedFinalForm ? 'primary' : 'default'}
                        className="form-filter-chip"
                        onClick={() => toggleFinalFormFilter(side)}
                      >
                        {FINAL_FORM_FILTER_LABEL}
                      </Button>
                      {spriteFormOptions.map((form) => (
                        <Button
                          key={`${side}-form-${form}`}
                          size="small"
                          type={filter.selectedForms.includes(form) ? 'primary' : 'default'}
                          className="form-filter-chip"
                          disabled={filter.selectedFinalForm}
                          onClick={() => toggleFormFilter(side, form)}
                        >
                          {form}
                        </Button>
                      ))}
                    </Space>
                  </div>
                </div>
                <Input
                  value={panel.search}
                  onChange={(event) => mutatePanel(side, (prev) => ({ ...prev, search: event.target.value }))}
                  placeholder={`搜索${side === 'left' ? '左侧' : '右侧'}精灵名称`}
                />
                <div className="sprite-picker-scroll">
                  {filteredSprites.length ? (
                    <div className="sprite-picker-grid">
                      {filteredSprites.map((sprite) => (
                        <Button
                          key={`${side}-${sprite.id}`}
                          className="sprite-card-button"
                          disabled={panelLocked}
                          onClick={() => applySprite(side, sprite)}
                        >
                          <div className="sprite-card-inner">
                            <SpritePetCard sprite={sprite} size={96} />
                          </div>
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配到精灵" />
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </Card>
    );
  }

  function renderPage4PanelEditor(side: PanelSide) {
    const panel = page4Panels[side];
    const filter = page4SpriteFilters[side];
    const searchValue = side === 'left' ? deferredPage4LeftSearch : deferredPage4RightSearch;
    const filteredSprites = sprites.filter((sprite) => {
      const keyword = searchValue.trim().toLowerCase();
      const values = [
        sprite.displayName,
        sprite.name,
        sprite.chineseName,
        sprite.filename,
        ...(sprite.aliases ?? []),
      ];
      const matchesKeyword = !keyword || values.some((value) => String(value ?? '').toLowerCase().includes(keyword));
      const spriteAttributes = splitSpriteAttributes(sprite.attribute);
      const matchesAttributes = !filter.selectedAttributes.length
        || filter.selectedAttributes.every((attribute) => spriteAttributes.includes(attribute));
      const matchesForms = filter.selectedFinalForm
        ? sprite.isFinalForm
        : !filter.selectedForms.length || filter.selectedForms.includes(sprite.form);

      return matchesKeyword && matchesAttributes && matchesForms;
    });
    const hasFilter = filter.selectedAttributes.length > 0 || filter.selectedForms.length > 0 || filter.selectedFinalForm;
    const currentSlot = panel.selected[panel.activeSlot] ?? createPage4EmptySlot(panel.activeSlot);
    const summary = summarizePage4Slots(panel.selected);

    return (
      <Card
        className="panel-editor-card"
        title={`${side === 'left' ? '左侧' : '右侧'} page4 阵容`}
        extra={(
          <Space wrap>
            <Text type="secondary">已选 {summary.selectedCount} / 6</Text>
            <Text type="secondary">阵亡 {summary.deadCount}</Text>
            <Switch
              checked={panel.autoSaveEnabled}
              checkedChildren="自动保存"
              unCheckedChildren="手动保存"
              onChange={(checked) => mutatePage4Panel(side, (prev) => ({ ...prev, autoSaveEnabled: checked }))}
            />
            {panel.saving ? <Tag color="processing">保存中</Tag> : null}
          </Space>
        )}
      >
        <div className={`panel-editor-layout panel-editor-layout-${side}`}>
          <div className={`panel-slot-rail panel-slot-rail-${side}`}>
            <div className={`panel-slot-grid panel-slot-grid-${side}`}>
              {panel.selected.map((slot, index) => (
                <Button
                  key={`${side}-page4-${index}`}
                  type={index === panel.activeSlot ? 'primary' : 'default'}
                  className={`slot-button slot-button-${side}`}
                  onClick={() => mutatePage4Panel(side, (prev) => ({ ...prev, activeSlot: index }))}
                >
                  <div className={`slot-button-inner slot-button-inner-${side}`}>
                    {slot.sprite?.path ? (
                      <SpritePetCard sprite={slot.sprite} size={96} />
                    ) : (
                      <div className="slot-placeholder">{index + 1}</div>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </div>

          <div className="panel-editor-main">
            <div className="panel-editor-tools">
              <Card size="small" className="subtle-card">
                <Space direction="vertical" size={12} className="control-stack">
                  {page4Notice ? (
                    <Alert
                      showIcon
                      closable
                      type={page4Notice.tone}
                      message={page4Notice.text}
                      onClose={() => setPage4Notice(null)}
                    />
                  ) : null}
                  <div>
                    <Text strong>当前槽位</Text>
                    <Paragraph type="secondary">这里的阵容只用于 page4 展示，不会同步到赛事管理或其他推流页面。</Paragraph>
                  </div>
                  <div className="page4-current-slot-preview">
                    {currentSlot.sprite ? (
                      <SpritePetCard sprite={currentSlot.sprite} size={96} />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前槽位为空" />
                    )}
                  </div>
                  <Space wrap>
                    <Text strong>阵亡</Text>
                    <Switch checked={currentSlot.isDead} onChange={() => togglePage4Dead(side)} />
                    <Button onClick={() => clearPage4CurrentSlot(side)}>清空当前</Button>
                    <Button onClick={() => clearPage4Panel(side)}>清空全部</Button>
                    <Button type="primary" onClick={() => void savePage4Panel(side)}>保存阵容</Button>
                  </Space>
                </Space>
              </Card>

              <Card size="small" className="subtle-card sprite-picker-card">
                <div className="sprite-picker-shell">
                  <div className="sprite-filter-panel">
                    <div className="sprite-filter-header">
                      <Text strong>筛选精灵</Text>
                      {hasFilter ? (
                        <Button size="small" type="link" onClick={() => clearPage4SpriteFilters(side)}>
                          清空筛选
                        </Button>
                      ) : null}
                    </div>
                    <div className="sprite-filter-group">
                      <Text type="secondary" className="sprite-filter-label">精灵属性（最多 2 个）</Text>
                      <div className="attribute-filter-grid">
                        {ATTRIBUTE_OPTIONS.map((option) => {
                          const active = filter.selectedAttributes.includes(option.label);
                          return (
                            <Button
                              key={`${side}-page4-attr-${option.code}`}
                              type={active ? 'primary' : 'default'}
                              className={`attribute-filter-chip${active ? ' is-active' : ''}`}
                              title={option.label}
                              aria-label={option.label}
                              onClick={() => togglePage4AttributeFilter(side, option.label)}
                            >
                              <span className="attribute-filter-chip-inner">
                                <img src={option.iconPath} alt="" className="attribute-filter-icon" />
                              </span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="sprite-filter-group">
                      <Text type="secondary" className="sprite-filter-label">精灵形态</Text>
                      <Space wrap size={[8, 8]}>
                        <Button
                          key={`${side}-page4-form-final`}
                          size="small"
                          type={filter.selectedFinalForm ? 'primary' : 'default'}
                          className="form-filter-chip"
                          onClick={() => togglePage4FinalFormFilter(side)}
                        >
                          最终形态
                        </Button>
                        {spriteFormOptions.map((form) => (
                          <Button
                            key={`${side}-page4-form-${form}`}
                            size="small"
                            type={filter.selectedForms.includes(form) ? 'primary' : 'default'}
                            className="form-filter-chip"
                            disabled={filter.selectedFinalForm}
                            onClick={() => togglePage4FormFilter(side, form)}
                          >
                            {form}
                          </Button>
                        ))}
                      </Space>
                    </div>
                  </div>
                  <Input
                    value={panel.search}
                    onChange={(event) => mutatePage4Panel(side, (prev) => ({ ...prev, search: event.target.value }))}
                    placeholder={`搜索${side === 'left' ? '左侧' : '右侧'}精灵名称`}
                  />
                  <div className="sprite-picker-scroll">
                    {filteredSprites.length ? (
                      <div className="sprite-picker-grid">
                        {filteredSprites.map((sprite) => (
                          <Button
                            key={`${side}-page4-${sprite.id}`}
                            className="sprite-card-button"
                            onClick={() => applyPage4Sprite(side, sprite)}
                          >
                            <div className="sprite-card-inner">
                              <SpritePetCard sprite={sprite} size={96} />
                            </div>
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配到精灵" />
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Layout className="admin-shell">
      <Sider width={292} breakpoint="lg" collapsedWidth={0} className="admin-sider">
        <div className="brand-block">
          <Text className="eyebrow">Control Room</Text>
          <Title level={3}>洛克王国 PVP 后台</Title>
          <Space wrap>
            <Tag color="gold">赛事管理</Tag>
            <Tag color="success">阵容编辑</Tag>
            <Tag color="processing">页面预览</Tag>
          </Space>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[view]}
          items={menuItems}
          onClick={({ key }) => setView(key as ViewKey)}
          className="admin-menu"
        />
      </Sider>

      <Layout className="admin-main">
        <Header className="admin-header">
          <div>
            <Text className="eyebrow">Admin Workspace</Text>
            <Title level={2}>
              {view === 'roster' ? '赛事工作台' : view === 'live' ? '实时控制' : view === 'page4' ? 'page4 展示' : view === 'history' ? '比赛历史' : view === 'scoreboard' ? '显示设置' : view === 'background' ? '背景素材' : view === 'preview' ? '页面预览' : '关于项目'}
            </Title>
          </div>
          <Space wrap>
            <Button href={buildPreviewUrl(previewSlot)} target="_blank">打开当前预览</Button>
            <Button onClick={() => void handleCopyPreviewLink()}>复制预览链接</Button>
            <Button type="primary" loading={refreshing} onClick={() => void loadInitialData(true)}>
              刷新全部数据
            </Button>
          </Space>
        </Header>

        <Content className="admin-content">
          {pageError ? (
            <Alert showIcon type="error" message="页面加载失败" description={pageError} />
          ) : null}

          {view === 'roster' ? (
            <Space direction="vertical" size={18} className="page-stack">
              <Row gutter={[18, 18]} className="roster-overview-row">
                <Col xs={24} xl={7} className="roster-overview-col">
                  <Card
                    className="roster-overview-card roster-match-list-card"
                    title="比赛列表"
                    extra={<Button type="primary" onClick={() => setCreateMatchOpen(true)}>开一局</Button>}
                  >
                    <div className="match-list-scroll">
                      <List
                        dataSource={matchStore.matches}
                        className="match-list"
                        locale={{ emptyText: '暂无赛事，先创建一场比赛吧。' }}
                        renderItem={(match) => (
                          <List.Item
                            className="match-list-item"
                            actions={[
                              <Button key="select" type={match.id === activeMatch?.id ? 'primary' : 'default'} onClick={() => void selectMatch(match.id)}>
                                {match.id === activeMatch?.id ? '当前' : '选择'}
                              </Button>,
                            ]}
                          >
                            <List.Item.Meta
                              avatar={<Badge status={match.status === 'completed' ? 'success' : match.status === 'in_progress' ? 'processing' : 'default'} />}
                              title={`${match.leftPlayer || '左侧'} vs ${match.rightPlayer || '右侧'}`}
                              description={(
                                <Space wrap>
                                  <Tag color="gold">BO{match.bestOf}</Tag>
                                  <Tag color={getMatchStatusColor(match.status)}>{getMatchStatusLabel(match.status)}</Tag>
                                  <Text type="secondary">{match.leftScore} : {match.rightScore}</Text>
                                </Space>
                              )}
                            />
                          </List.Item>
                        )}
                      />
                    </div>
                  </Card>
                </Col>
                <Col xs={24} xl={17} className="roster-overview-col">
                  <Card
                    className="roster-overview-card roster-current-card"
                    title="当前比赛"
                    extra={(
                      <Space wrap size={8} className="roster-card-head-extra">
                        {rosterNotice ? (
                          <Tag
                            closable
                            bordered={false}
                            color={getNoticeTagColor(rosterNotice.tone)}
                            className="roster-notice-tag"
                            onClose={() => setRosterNotice(null)}
                          >
                            {rosterNotice.text}
                          </Tag>
                        ) : null}
                        <Tag color={activeMatch ? getMatchStatusColor(activeMatch.status) : 'default'}>
                          {activeMatch ? getMatchStatusLabel(activeMatch.status) : '未创建'}
                        </Tag>
                      </Space>
                    )}
                  >
                    {activeMatch ? (
                      <Space direction="vertical" size={18} className="page-stack">
                        <div className="current-match-overview">
                          <div className="current-match-player current-match-player-left">
                            <Text type="secondary" className="current-match-player-label">左侧选手</Text>
                            <Text strong className="current-match-player-name current-match-player-name-left">
                              {activeMatch.leftPlayer || '未设置'}
                            </Text>
                          </div>
                          <div className="current-match-score-block">
                            <Text type="secondary" className="current-match-score-label">当前比分</Text>

                            <div
                              className="current-match-score-card"
                              aria-label={`当前比分 ${activeMatch.leftScore} 比 ${activeMatch.rightScore}`}
                            >
                              <div className="current-match-scoreline">
                                <span className="current-match-score-value">{activeMatch.leftScore}</span>
                                <span className="current-match-score-separator">:</span>
                                <span className="current-match-score-value">{activeMatch.rightScore}</span>
                              </div>
                              
                            </div>
                            <Text type="secondary" className="current-match-meta">
                              BO{activeMatch.bestOf} · {currentGame ? `第 ${currentGame.gameNumber} 局` : '暂无对局'}
                            </Text>
                          </div>
                          <div className="current-match-player current-match-player-right">
                            <Text type="secondary" className="current-match-player-label">右侧选手</Text>
                            <Text strong className="current-match-player-name current-match-player-name-right">
                              {activeMatch.rightPlayer || '未设置'}
                            </Text>
                          </div>
                        </div>
                        <div className="current-match-statusbar">
                          <Steps current={progress.current} items={progress.items} responsive />
                        </div>
                        <Form
                          form={matchForm}
                          layout="vertical"
                          className="current-match-form"
                          onFinish={(values) => void saveMatchMeta(values)}
                        >
                          <Row gutter={[16, 16]}>
                            <Col xs={24} md={8}>
                              <Form.Item label="左侧选手" name="leftPlayer">
                                <Input maxLength={32} placeholder="输入左侧选手名字" />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item label="右侧选手" name="rightPlayer">
                                <Input maxLength={32} placeholder="输入右侧选手名字" />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item label="比赛赛制" name="bestOf">
                                <Select
                                  options={[
                                    { value: 1, label: 'BO1' },
                                    { value: 3, label: 'BO3' },
                                    { value: 5, label: 'BO5' },
                                    { value: 7, label: 'BO7' },
                                  ]}
                                />
                              </Form.Item>
                            </Col>
                          </Row>
                          <div className="current-match-action-row">
                            <Space wrap size={12} className="current-match-action-group">
                              <Button type="primary" htmlType="submit">保存比赛信息</Button>
                              <Button
                                onClick={() => void runMatchAction('start')}
                                disabled={!currentGame || currentGame.status !== 'pending' || !currentGame.leftLineup.length || !currentGame.rightLineup.length}
                              >
                                开始本次对局
                              </Button>
                            </Space>
                            <Space wrap size={12} className="current-match-action-group current-match-action-group-right">
                              <Button type="dashed" onClick={() => void runMatchAction('winner', { winner: 'left' })} disabled={currentGame?.status !== 'in_progress'}>
                                左侧赢了
                              </Button>
                              <Button type="dashed" onClick={() => void runMatchAction('winner', { winner: 'right' })} disabled={currentGame?.status !== 'in_progress'}>
                                右侧赢了
                              </Button>
                              <Button onClick={() => void runMatchAction('undo')} disabled={!matchStore.history.canUndo}>撤回上一步</Button>
                              <Button onClick={() => void runMatchAction('redo')} disabled={!matchStore.history.canRedo}>取消撤回</Button>
                            </Space>
                          </div>
                        </Form>
                      </Space>
                    ) : (
                      <Empty description="先创建或选择一场赛事" />
                    )}
                  </Card>
                </Col>
              </Row>

              <Row gutter={[18, 18]}>
                <Col xs={24} xl={12}>{renderPanelEditor('left')}</Col>
                <Col xs={24} xl={12}>{renderPanelEditor('right')}</Col>
              </Row>
            </Space>
          ) : null}

          {view === 'page4' ? (
            <Space direction="vertical" size={18} className="page-stack">
              <Row gutter={[18, 18]}>
                <Col xs={24} xl={12}>{renderPage4PanelEditor('left')}</Col>
                <Col xs={24} xl={12}>{renderPage4PanelEditor('right')}</Col>
              </Row>
            </Space>
          ) : null}

          {view === 'history' ? (
            <Space direction="vertical" size={18} className="page-stack">
              <Card
                title="比赛历史"
                extra={(
                  <Space wrap>
                    <Button danger disabled={!selectedHistoryKeys.length} onClick={() => void deleteHistoryMatches(selectedHistoryKeys.map(String))}>
                      删除选中赛事
                    </Button>
                    <Button onClick={() => void undoDeletedHistoryMatches()} disabled={!matchStore.history.canUndoDelete}>
                      撤回最近删除
                    </Button>
                  </Space>
                )}
              >
                {historyNotice ? (
                  <Alert
                    showIcon
                    closable
                    type={historyNotice.tone}
                    message={historyNotice.text}
                    className="history-notice"
                    onClose={() => setHistoryNotice(null)}
                  />
                ) : null}
                <Space wrap className="history-filter-row">
                  <Tag color={!historyTagFilter ? 'processing' : 'default'} onClick={() => setHistoryTagFilter(null)}>全部</Tag>
                  {allHistoryTags.map((tag) => (
                    <Tag key={tag} color={historyTagFilter === tag ? 'processing' : 'default'} onClick={() => setHistoryTagFilter(historyTagFilter === tag ? null : tag)}>
                      {tag}
                    </Tag>
                  ))}
                </Space>
                <Table
                  rowKey={(record) => record.id}
                  columns={historyColumns}
                  dataSource={filteredMatches}
                  rowSelection={{
                    selectedRowKeys: selectedHistoryKeys,
                    onChange: (keys) => setSelectedHistoryKeys(keys),
                  }}
                  expandable={{
                    expandedRowRender: (record) => (
                      <Space direction="vertical" size={16} className="history-detail">
                        <Text type="secondary">
                          {record.id} · BO{record.bestOf} · 已记录 {record.games.filter((game) => game.status === 'completed').length} 局
                          {record.completedAt ? ` · 完成于 ${formatDateTime(record.completedAt)}` : ''}
                        </Text>
                        {getVisibleGames(record).map((game) => {
                          const battleEntries = buildHistoryBattleEntries(game, spriteMap);
                          const leftLost = game.winner === 'right';
                          const rightLost = game.winner === 'left';

                          return (
                          <Card key={`${record.id}-${game.gameNumber}`} size="small" className="subtle-card">
                            <Space direction="vertical" size={12} className="control-stack">
                              <Space wrap>
                                <Tag color="gold">第 {game.gameNumber} 局</Tag>
                                <Tag color={game.status === 'completed' ? 'success' : game.status === 'in_progress' ? 'processing' : 'default'}>
                                  {getGameStatusLabel(game.status)}
                                </Tag>
                                <Tag color={game.winner === 'left' ? 'success' : game.winner === 'right' ? 'volcano' : 'default'}>
                                  {getGameResultLabel(game)}
                                </Tag>
                                <Text type="secondary">左侧 1-6 · 右侧 7-12</Text>
                              </Space>
                              <div className="history-battle-grid">
                                {battleEntries.map((entry, index) => {
                                  const isLeft = index < 6;
                                  const lost = isLeft ? leftLost : rightLost;

                                  return (
                                    <Card
                                      key={`${record.id}-${game.gameNumber}-${isLeft ? 'left' : 'right'}-${index}`}
                                      size="small"
                                      className={`history-slot-card history-slot-card-${isLeft ? 'left' : 'right'}${lost ? ' is-lost' : ''}${!entry ? ' is-empty' : ''}`}
                                    >
                                      <Space direction="vertical" size={6} className="history-slot-stack">
                                        {entry?.path ? (
                                          <Image
                                            preview={false}
                                            src={entry.path}
                                            alt={entry.name}
                                            className="history-slot-image"
                                            fallback="/assets/ui/back.png"
                                          />
                                        ) : (
                                          <div className="history-slot-fallback">{index + 1}</div>
                                        )}
                                        <Text ellipsis className="history-slot-name">{entry?.name ?? `空位 ${index + 1}`}</Text>
                                      </Space>
                                    </Card>
                                  );
                                })}
                              </div>
                            </Space>
                          </Card>
                          );
                        })}
                      </Space>
                    ),
                    expandedRowKeys: expandedHistoryKeys,
                    onExpand: (expanded, record) => {
                      setExpandedHistoryKeys(expanded ? [record.id] : []);
                    },
                  }}
                  locale={{ emptyText: '暂无历史赛事' }}
                />
              </Card>
            </Space>
          ) : null}

          {view === 'live' ? (
            <Space direction="vertical" size={18} className="page-stack">
              <Card
                title="实时控制"
                extra={(
                  <Space wrap>
                    <Button onClick={() => void loadInitialData(true)}>重新加载</Button>
                    <Button onClick={() => void handleExportLiveConfig()}>配置导出</Button>
                  </Space>
                )}
              >
                <Space direction="vertical" size={16} className="page-stack">
                  {liveNotice ? (
                    <Alert
                      showIcon
                      closable
                      type={liveNotice.tone}
                      message={liveNotice.text}
                      onClose={() => setLiveNotice(null)}
                    />
                  ) : null}
                  <Row gutter={[18, 18]}>
                    {(['left', 'right'] as PanelSide[]).map((side) => (
                      <Col key={side} xs={24} xl={12}>
                        <Card title={side === 'left' ? '左侧实时面板' : '右侧实时面板'}>
                          <div className="live-grid">
                            {panels[side].selected.map((slot, index) => (
                              <div key={`live-${side}-${index}`} className="live-slot-card">
                                <div className="live-slot-preview">
                                  <span className="live-slot-index">{index + 1}</span>
                                  {slot.sprite?.path ? (
                                    <Image preview={false} src={slot.sprite.path} alt={slot.sprite.displayName} className="live-slot-image" fallback="/assets/ui/back.png" />
                                  ) : (
                                    <div className="live-slot-empty">空槽位</div>
                                  )}
                                  <Text ellipsis className="live-slot-name">{slot.sprite?.displayName ?? '未选择精灵'}</Text>
                                </div>
                                <div className="live-slot-controls">
                                  <div className="live-input-row">
                                    <Text strong className="live-input-label">HP</Text>
                                    <Slider
                                      key={`live-health-${side}-${index}-${slot.sprite?.id ?? 'empty'}-${slot.healthEnabled ? 'on' : 'off'}-${getHealthLevel(slot)}`}
                                      min={0}
                                      max={100}
                                      defaultValue={getHealthLevel(slot)}
                                      onChangeComplete={(value) => void saveLiveField(side, index, 'healthPercent', Number(value))}
                                      className="live-input-slider"
                                      tooltip={{ formatter: (value) => `${value ?? 0}%` }}
                                    />
                                  </div>
                                  <div className="live-input-row">
                                    <Text strong className="live-input-label">能量</Text>
                                    <Slider
                                      key={`live-energy-${side}-${index}-${slot.sprite?.id ?? 'empty'}-${getEnergyLevel(slot)}`}
                                      min={0}
                                      max={10}
                                      step={1}
                                      defaultValue={getEnergyLevel(slot)}
                                      onChangeComplete={(value) => void saveLiveField(side, index, 'energyValue', Number(value))}
                                      className="live-input-slider"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                  <Row gutter={[16, 16]}>
                    <Col xs={24}>
                      <Card size="small" className="subtle-card live-watch-card">
                        <Space direction="vertical" size={14} className="control-stack">
                          <Space align="start" className="live-watch-header">
                            <div>
                              <Text type="secondary">监听目标 JSON</Text>
                              <Title level={5}>{liveConfigEnabled ? '监听中' : '未监听'}</Title>
                              <Text type="secondary">{liveFileName || '点击或拖拽选择要监听的 JSON 文件'}</Text>
                            </div>
                            <Button type={liveConfigEnabled ? 'default' : 'primary'} danger={liveConfigEnabled} onClick={handleLiveConfigWatchToggle}>
                              {liveConfigEnabled ? '关闭监听' : '开启实时监听'}
                            </Button>
                          </Space>
                          <Upload.Dragger
                            accept=".json,application/json"
                            showUploadList={false}
                            className="live-watch-uploader"
                            beforeUpload={(file) => handleLiveConfigUpload(file as File & { path?: string })}
                          >
                            <p className="ant-upload-text">选择或拖拽监听 JSON</p>
                            <p className="ant-upload-hint">监听开启后，后台会持续读取这个本地文件并回写当前数值。</p>
                          </Upload.Dragger>
                        </Space>
                      </Card>
                    </Col>
                  </Row>
                </Space>
              </Card>
            </Space>
          ) : null}

          {view === 'scoreboard' ? (
            <Space direction="vertical" size={18} className="page-stack">
              <Card title="显示设置">
                <Form form={scoreboardForm} layout="vertical" onFinish={(values) => void saveScoreboardSettings(values)}>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12} xl={8}>
                      <Card size="small" className="subtle-card" title="比分栏显示">
                        <Space direction="vertical" size={14} className="control-stack">
                          <Form.Item label="顶部比分栏显示" name="scoreboardEnabled" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                          <Form.Item label="血量徽标显示" name="healthBadgeEnabled" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                          <Form.Item label="能力值徽标显示" name="abilityBadgeEnabled" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                          <Form.Item label="Center Area 显示" name="centerAreaEnabled" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                          <Form.Item label="Center Area 背景颜色" name="centerAreaColor">
                            <Input />
                          </Form.Item>
                        </Space>
                      </Card>
                    </Col>
                    <Col xs={24} md={12} xl={8}>
                      <Card size="small" className="subtle-card" title="文字与页面2">
                        <Space direction="vertical" size={14} className="control-stack">
                          <Form.Item label="页面2赛事标题显示" name="eventTitleEnabled" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                          <Form.Item label="页面2赛事标题" name="eventTitle">
                            <Input maxLength={40} />
                          </Form.Item>
                          <Form.Item label="页面2阵容展示" name="page2LineupDisplayMode">
                            <Select
                              options={[
                                { value: 'default', label: '默认血量展示' },
                                { value: 'avatar-only', label: '仅头像展示' },
                              ]}
                            />
                          </Form.Item>
                          <Form.Item label="选手名字字号" name="nameFontSize">
                            <InputNumber min={12} max={160} className="full-width-number" />
                          </Form.Item>
                          <Form.Item label="比分字号" name="scoreFontSize">
                            <InputNumber min={12} max={160} className="full-width-number" />
                          </Form.Item>
                        </Space>
                      </Card>
                    </Col>
                    <Col xs={24} xl={8}>
                      <Card size="small" className="subtle-card" title="页面3头像">
                        <Space direction="vertical" size={16} className="control-stack">
                          {(['left', 'right'] as PanelSide[]).map((side) => {
                            const avatar = avatars[side];
                            const previewSrc = avatar.exists
                              ? `${avatar.path}?t=${avatar.mtime ?? Date.now()}`
                              : side === 'left'
                                ? '/assets/ui/left-avatar.png'
                                : '/assets/ui/right-avatar.png';

                            return (
                              <Card key={side} size="small" className="avatar-card">
                                <Space direction="vertical" size={12} className="control-stack">
                                  <Text strong>{side === 'left' ? '左侧头像' : '右侧头像'}</Text>
                                  <Image preview={false} src={previewSrc} className="avatar-preview-image" />
                                  <Space wrap>
                                    <Upload
                                      showUploadList={false}
                                      beforeUpload={(file) => {
                                        void uploadAvatarFile(side, file as File);
                                        return false;
                                      }}
                                    >
                                      <Button>选择头像</Button>
                                    </Upload>
                                    <Button danger onClick={() => void deleteAvatarFile(side)}>删除</Button>
                                  </Space>
                                </Space>
                              </Card>
                            );
                          })}
                        </Space>
                      </Card>
                    </Col>
                  </Row>
                  <Divider />
                  <Space wrap>
                    <Button type="primary" htmlType="submit">保存显示设置</Button>
                    <Tag color="blue">
                      当前比分：{scoreboard?.leftScore ?? '0'} : {scoreboard?.rightScore ?? '0'}
                    </Tag>
                    <Tag color="gold">
                      当前赛制：BO{scoreboard?.bestOf ?? '-'}
                    </Tag>
                  </Space>
                </Form>
              </Card>
            </Space>
          ) : null}

          {view === 'background' ? (
            <Card title="背景图管理">
              <Row gutter={[18, 18]}>
                <Col xs={24} xl={10}>
                  <Upload.Dragger
                    showUploadList={false}
                    beforeUpload={(file) => {
                      void uploadBackgroundFile(file as File);
                      return false;
                    }}
                  >
                    <p className="ant-upload-text">点击或拖拽上传背景图</p>
                    <p className="ant-upload-hint">建议使用 1920 × 1080 的直播背景尺寸。</p>
                  </Upload.Dragger>
                  <Space wrap className="background-actions">
                    <Button onClick={() => window.open('/cache/background.png', '_blank')}>查看当前背景</Button>
                    <Button danger onClick={() => void deleteBackgroundFile()}>删除背景图</Button>
                  </Space>
                </Col>
                <Col xs={24} xl={14}>
                  <Card size="small" className="subtle-card" title="当前背景预览">
                    {background.exists ? (
                      <Image
                        src={`${background.path}?t=${background.mtime ?? Date.now()}`}
                        className="background-preview-image"
                      />
                    ) : (
                      <Empty description="当前使用默认背景" />
                    )}
                  </Card>
                </Col>
              </Row>
            </Card>
          ) : null}

          {view === 'preview' ? (
            <Space direction="vertical" size={18} className="page-stack">
              <Card
                className="preview-page-card"
                title={getPreviewPage(previewSlot).title}
                extra={<Button type="primary" href={buildPreviewUrl(previewSlot)} target="_blank">新窗口打开</Button>}
              >
                <Space direction="vertical" size={16} className="page-stack">
                  <Segmented
                    value={previewSlot}
                    options={[
                      { value: 'page1', label: '推流页面1' },
                      { value: 'page2', label: '推流页面2' },
                      { value: 'page3', label: '推流页面3' },
                      { value: 'page4', label: '推流页面4' },
                      { value: 'standby', label: '等待页 Demo' },
                    ]}
                    onChange={(value) => setPreviewSlot(value as PreviewSlotKey)}
                  />
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Card size="small" className="subtle-card preview-info-card">
                        <Statistic title="本地部署地址" value={getLocalAddressText(previewSlot)} />
                        <Divider />
                        <Button block onClick={() => void handleCopyLocalAddress()}>复制地址</Button>
                      </Card>
                    </Col>
                    <Col xs={24} md={12}>
                      <Card size="small" className="subtle-card preview-info-card">
                        <Statistic title="完整预览链接" value={buildPreviewUrl(previewSlot)} />
                        <Divider />
                        <Button block onClick={() => void handleCopyPreviewLink()}>复制链接</Button>
                      </Card>
                    </Col>
                  </Row>
                  <div className="preview-frame-shell" ref={previewFrameShellRef}>
                    <div
                      className="preview-frame-viewport"
                      style={{ width: `${previewShellSize.width}px`, height: `${previewShellSize.height}px` }}
                    >
                      <div className="preview-frame-stage" style={{ transform: `scale(${previewScale})` }}>
                      <iframe title="preview" className="preview-frame" src={buildPreviewUrl(previewSlot)} />
                      </div>
                    </div>
                  </div>
                </Space>
              </Card>
            </Space>
          ) : null}

          {view === 'about' ? (
            <Space direction="vertical" size={18} className="page-stack">
              <Row gutter={[18, 18]}>
                <Col xs={24} xl={16}>
                  <Card>
                    <Space direction="vertical" size={16} className="page-stack">
                      <div>
                        <Text className="eyebrow">About This Site</Text>
                        <Title level={3}>关于这个新的后台</Title>
                      </div>
                      <Paragraph>
                        这个后台面向洛克王国 PVP 直播场景，把赛事录入、阵容同步、比分控制、素材管理和推流页面预览统一收口到同一套 Ant Design 工作台里。
                      </Paragraph>
                      <Row gutter={[16, 16]}>
                        <Col xs={24} md={8}>
                          <Card size="small" className="subtle-card">
                            <Title level={5}>赛事与比分统一管理</Title>
                            <Paragraph type="secondary">创建赛事、维护 BO 赛制、记录每小局胜负，并把当前状态同步到推流页面。</Paragraph>
                          </Card>
                        </Col>
                        <Col xs={24} md={8}>
                          <Card size="small" className="subtle-card">
                            <Title level={5}>左右阵容独立编辑</Title>
                            <Paragraph type="secondary">两边阵容可分别配置，并独立调节血量、能力值、透明度和饱和度。</Paragraph>
                          </Card>
                        </Col>
                        <Col xs={24} md={8}>
                          <Card size="small" className="subtle-card">
                            <Title level={5}>素材与预览联动</Title>
                            <Paragraph type="secondary">背景图、头像、推流页面 1/2/3 和等待页都能在后台里一起管理。</Paragraph>
                          </Card>
                        </Col>
                      </Row>
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} xl={8}>
                  <Card>
                    <Space direction="vertical" size={12} className="page-stack">
                      <Title level={4}>项目链接</Title>
                      <Link href="/login.html" target="_blank">登录页入口</Link>
                      <Link href="/admin.html" target="_blank">当前后台入口</Link>
                      <Link href="/roco-pvp.html" target="_blank">推流页面 2</Link>
                      <Link href="https://wiki.biligame.com/rocom/" target="_blank">精灵图素材来源</Link>
                      <Link href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans" target="_blank">CC BY-NC-SA 4.0</Link>
                    </Space>
                  </Card>
                </Col>
              </Row>
            </Space>
          ) : null}
        </Content>
      </Layout>

      <Modal
        title="创建赛事"
        open={createMatchOpen}
        onCancel={() => setCreateMatchOpen(false)}
        onOk={() => createMatchForm.submit()}
        okText="创建比赛"
        cancelText="取消"
      >
        <Form
          form={createMatchForm}
          layout="vertical"
          initialValues={{ bestOf: 3, tags: [] }}
          onFinish={(values) => void createMatch(values)}
        >
          <Form.Item label="左侧选手" name="leftPlayer" rules={[{ required: true, message: '请输入左侧选手名' }]}>
            <Input maxLength={32} placeholder="例如：选手A" />
          </Form.Item>
          <Form.Item label="右侧选手" name="rightPlayer" rules={[{ required: true, message: '请输入右侧选手名' }]}>
            <Input maxLength={32} placeholder="例如：选手B" />
          </Form.Item>
          <Form.Item label="比赛赛制" name="bestOf">
            <Select
              options={[
                { value: 1, label: 'BO1' },
                { value: 3, label: 'BO3' },
                { value: 5, label: 'BO5' },
                { value: 7, label: 'BO7' },
              ]}
            />
          </Form.Item>
          <Form.Item label="赛事标签" name="tags">
            <Select
              mode="multiple"
              allowClear
              placeholder="可选，选择赛事标签"
              options={allHistoryTags.map((tag) => ({ value: tag, label: tag }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}

export function AdminApp() {
  return (
    <ConfigProvider theme={theme}>
      <App>
        <Dashboard />
      </App>
    </ConfigProvider>
  );
}

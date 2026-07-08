import React, { startTransition, useDeferredValue, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  ConfigProvider,
  Descriptions,
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
  Progress,
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

import { SOCKET_EVENTS } from '../../shared/events';
import type {
  AvatarCollectionState,
  BackgroundState,
  GameRecord,
  MatchRecord,
  MatchStoreState,
  PanelState,
  QuickFillMatch,
  ScoreboardState,
  SlotState,
  SpriteRecord,
} from '../../shared/types';

const { Header, Sider, Content } = Layout;
const { Title, Paragraph, Text, Link } = Typography;
const { TextArea } = Input;

type PanelSide = 'left' | 'right';
type ViewKey = 'roster' | 'history' | 'scoreboard' | 'background' | 'preview' | 'about';

type PreviewSlotKey = 'page1' | 'page2' | 'page3' | 'standby';

type JsonInit = RequestInit & {
  json?: unknown;
};

type MatchFormValues = {
  leftPlayer: string;
  rightPlayer: string;
  bestOf: number;
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

declare global {
  interface Window {
    rocoDesktop?: {
      copyText?: (text: string) => Promise<void>;
    };
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
  standby: {
    title: '等待页 Demo',
    fileName: 'live-standby-demo.html',
    path: '/live-standby-demo.html',
  },
};

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
    borderRadius: 18,
    borderRadiusLG: 24,
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
      borderRadiusLG: 24,
    },
    Button: {
      borderRadius: 999,
      controlHeight: 42,
    },
    Input: {
      borderRadius: 16,
    },
    InputNumber: {
      borderRadius: 16,
    },
    Select: {
      borderRadius: 16,
    },
    Collapse: {
      borderRadiusLG: 20,
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

function panelStateToSelected(panel: PanelState | null | undefined): SlotState[] {
  return cloneSelected(panel?.selected);
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

function openLiveControlWindow(): void {
  window.open('/live-control.html', 'roco-live-control-window', 'popup=yes,width=880,height=400');
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
    current = 2;
  } else if (readyToStart) {
    current = 1;
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
  const [sprites, setSprites] = useState<SpriteRecord[]>([]);
  const [createMatchOpen, setCreateMatchOpen] = useState(false);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [tagEditorMatchId, setTagEditorMatchId] = useState<string | null>(null);
  const [selectedHistoryKeys, setSelectedHistoryKeys] = useState<React.Key[]>([]);
  const [historyTagFilter, setHistoryTagFilter] = useState<string | null>(null);
  const [previewSlot, setPreviewSlot] = useState<PreviewSlotKey>('page1');
  const [rosterNotice, setRosterNotice] = useState<NoticeState>(null);
  const [historyNotice, setHistoryNotice] = useState<NoticeState>(null);
  const [scoreboardForm] = Form.useForm<ScoreboardFormValues>();
  const [matchForm] = Form.useForm<MatchFormValues>();
  const [createMatchForm] = Form.useForm<CreateMatchValues>();
  const [tagForm] = Form.useForm<{ tags: string }>();

  const spriteMap = new Map(sprites.map((sprite) => [sprite.id, sprite]));
  const activeMatch = getActiveMatch(matchStore);
  const currentGame = getCurrentGame(activeMatch);
  const progress = buildProgressItems(activeMatch);
  const leftPanelSummary = summarizePanelSlots(panels.left.selected);
  const rightPanelSummary = summarizePanelSlots(panels.right.selected);
  const allHistoryTags = buildHistoryTags(matchStore.matches);
  const filteredMatches = historyTagFilter
    ? matchStore.matches.filter((match) => (match.tags ?? []).includes(historyTagFilter))
    : matchStore.matches;

  const deferredLeftSearch = useDeferredValue(panels.left.search);
  const deferredRightSearch = useDeferredValue(panels.right.search);

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

  function applyServerState(payload: {
    scoreboard?: ScoreboardState;
    matches?: MatchStoreState;
    background?: BackgroundState;
    avatars?: AvatarCollectionState;
    panels?: PanelState[];
    panel?: PanelState;
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
    });
  }

  async function loadInitialData(showToast = false) {
    setRefreshing(true);
    setPageError('');

    try {
      const [auth, nextScoreboard, nextMatches, nextBackground, nextAvatars, nextPanels, nextSprites] = await Promise.all([
        requestJson<{ authenticated: boolean }>('/api/auth/check'),
        requestJson<ScoreboardState>('/api/scoreboard'),
        requestJson<MatchStoreState>('/api/matches'),
        requestJson<BackgroundState>('/api/background'),
        requestJson<AvatarCollectionState>('/api/avatars'),
        requestJson<{ images: [PanelState, PanelState] }>('/api/images'),
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

  async function savePanel(side: PanelSide, silent = false) {
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
      setRosterNotice({ tone: 'success', text: `已切换到赛事 ${matchId}` });
      message.success(`已切换到赛事 ${matchId}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function createMatch(values: CreateMatchValues) {
    try {
      const data = await requestJson<{ success: boolean; matches?: MatchStoreState; scoreboard?: ScoreboardState; panels?: PanelState[] }>('/api/matches', {
        method: 'POST',
        json: values,
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

  async function saveTags(values: { tags: string }) {
    if (!tagEditorMatchId) {
      return;
    }

    const tags = values.tags
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10);

    try {
      const data = await requestJson<{ success: boolean; matches?: MatchStoreState }>(`/api/matches/${encodeURIComponent(tagEditorMatchId)}/tags`, {
        method: 'PATCH',
        json: { tags },
      });
      applyServerState({ matches: data.matches });
      setTagEditorOpen(false);
      setTagEditorMatchId(null);
      setHistoryNotice({ tone: 'success', text: '标签已更新' });
      message.success('标签已保存');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeMatchTag(record: MatchRecord, tagValue: string) {
    const tags = (record.tags ?? []).filter((tag) => tag !== tagValue);

    try {
      const data = await requestJson<{ success: boolean; matches?: MatchStoreState }>(`/api/matches/${encodeURIComponent(record.id)}/tags`, {
        method: 'PATCH',
        json: { tags },
      });
      applyServerState({ matches: data.matches });
      setHistoryNotice({ tone: 'success', text: `已从 ${record.id} 删除标签“${tagValue}”` });
      message.success('标签已删除');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
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

  function openTagEditor(match: MatchRecord) {
    setTagEditorMatchId(match.id);
    tagForm.setFieldsValue({ tags: (match.tags ?? []).join(', ') });
    setTagEditorOpen(true);
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
    { key: 'history', label: '比赛历史' },
    { key: 'scoreboard', label: '显示设置' },
    { key: 'background', label: '背景素材' },
    { key: 'preview', label: '页面预览' },
    { key: 'about', label: '关于项目' },
  ];

  const historyColumns: ColumnsType<MatchRecord> = [
    {
      title: '对阵',
      key: 'players',
      render: (_: unknown, record: MatchRecord) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.leftPlayer || '左侧'}</Text>
          <Text type="secondary">vs {record.rightPlayer || '右侧'}</Text>
        </Space>
      ),
    },
    {
      title: '比分',
      key: 'score',
      render: (_: unknown, record: MatchRecord) => (
        <Text strong>{record.leftScore} : {record.rightScore}</Text>
      ),
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
        <Space wrap>
          {tags?.length ? tags.map((tag) => (
            <Tag
              key={`${record.id}-${tag}`}
              color={historyTagFilter === tag ? 'processing' : DEFAULT_TAGS.includes(tag) ? 'gold' : 'default'}
              closable
              onClick={() => setHistoryTagFilter(tag)}
              onClose={(event) => {
                event.preventDefault();
                void removeMatchTag(record, tag);
              }}
            >
              {tag}
            </Tag>
          )) : <Text type="secondary">无</Text>}
          <Button size="small" type="link" onClick={() => openTagEditor(record)}>编辑</Button>
        </Space>
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
          <Button size="small" onClick={() => openTagEditor(record)}>编辑标签</Button>
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
    const activeSlot = panel.selected[panel.activeSlot] ?? createEmptySlot(panel.activeSlot);
    const searchValue = side === 'left' ? deferredLeftSearch : deferredRightSearch;
    const filteredSprites = sprites.filter((sprite) => {
      const keyword = searchValue.trim().toLowerCase();
      if (!keyword) {
        return true;
      }
      const values = [
        sprite.displayName,
        sprite.name,
        sprite.chineseName,
        sprite.filename,
        ...(sprite.aliases ?? []),
      ];
      return values.some((value) => String(value ?? '').toLowerCase().includes(keyword));
    });

    return (
      <Card
        title={`${side === 'left' ? '左侧' : '右侧'}当前阵容`}
        extra={(
          <Space wrap>
            <Text type="secondary">已选 {summarizePanelSlots(panel.selected).selectedCount} / 6</Text>
            <Switch
              checked={panel.autoSaveEnabled}
              checkedChildren="自动保存"
              unCheckedChildren="手动保存"
              onChange={(checked) => mutatePanel(side, (prev) => ({ ...prev, autoSaveEnabled: checked }))}
            />
            {panel.saving ? <Tag color="processing">保存中</Tag> : null}
          </Space>
        )}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={9}>
            <div className="panel-slot-grid">
              {panel.selected.map((slot, index) => (
                <Button
                  key={`${side}-${index}`}
                  type={index === panel.activeSlot ? 'primary' : 'default'}
                  className="slot-button"
                  onClick={() => mutatePanel(side, (prev) => ({ ...prev, activeSlot: index }))}
                >
                  <Space direction="vertical" size={4} className="slot-button-inner">
                    {slot.sprite?.path ? (
                      <Image
                        preview={false}
                        src={slot.sprite.path}
                        alt={slot.sprite.displayName}
                        className="slot-image"
                        fallback="/assets/ui/back.png"
                      />
                    ) : (
                      <div className="slot-placeholder">槽位 {index + 1}</div>
                    )}
                    <Text ellipsis className="slot-name">
                      {slot.sprite?.displayName ?? `槽位 ${index + 1}`}
                    </Text>
                    <Space size={4} wrap>
                      <Tag bordered={false} color="blue">HP {slot.healthPercent}</Tag>
                      <Tag bordered={false} color="gold">能量 {slot.energyValue}</Tag>
                    </Space>
                  </Space>
                </Button>
              ))}
            </div>
          </Col>
          <Col xs={24} xl={15}>
            <Space direction="vertical" size={16} className="panel-editor-stack">
              <Card size="small" className="subtle-card">
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="当前槽位">#{panel.activeSlot + 1}</Descriptions.Item>
                  <Descriptions.Item label="当前精灵">{activeSlot.sprite?.displayName ?? '未选择'}</Descriptions.Item>
                  <Descriptions.Item label="血量">{activeSlot.healthPercent}%</Descriptions.Item>
                  <Descriptions.Item label="能力值">{activeSlot.energyValue}</Descriptions.Item>
                </Descriptions>
                <Progress percent={activeSlot.healthPercent} size="small" strokeColor="#c7632f" />
              </Card>

              <Collapse
                items={[
                  {
                    key: 'battle',
                    label: '当前槽位血量与能力值',
                    children: (
                      <Space direction="vertical" size={16} className="control-stack">
                        <div className="field-row">
                          <Text>启用血量效果</Text>
                          <Switch
                            checked={activeSlot.healthEnabled}
                            onChange={(checked) => updateSlot(side, (slot) => ({ ...slot, healthEnabled: checked }))}
                          />
                        </div>
                        <div className="slider-row">
                          <Text>血量</Text>
                          <Slider
                            min={0}
                            max={100}
                            value={activeSlot.healthPercent}
                            onChange={(value: number) => updateSlot(side, (slot) => ({ ...slot, healthPercent: Number(value) }))}
                          />
                          <InputNumber
                            min={0}
                            max={100}
                            value={activeSlot.healthPercent}
                            onChange={(value) => updateSlot(side, (slot) => ({ ...slot, healthPercent: Number(value ?? 100) }))}
                          />
                        </div>
                        <div className="slider-row">
                          <Text>能力值</Text>
                          <Slider
                            min={0}
                            max={10}
                            value={activeSlot.energyValue}
                            onChange={(value: number) => updateSlot(side, (slot) => ({ ...slot, energyValue: Number(value) }))}
                          />
                          <InputNumber
                            min={0}
                            max={10}
                            value={activeSlot.energyValue}
                            onChange={(value) => updateSlot(side, (slot) => ({ ...slot, energyValue: Number(value ?? 10) }))}
                          />
                        </div>
                      </Space>
                    ),
                  },
                  {
                    key: 'visual',
                    label: '透明度与饱和度',
                    children: (
                      <Space direction="vertical" size={16} className="control-stack">
                        <div className="field-row">
                          <Text>启用透明度效果</Text>
                          <Switch
                            checked={activeSlot.opacityEnabled}
                            onChange={(checked) => updateSlot(side, (slot) => ({ ...slot, opacityEnabled: checked }))}
                          />
                        </div>
                        <div className="slider-row">
                          <Text>透明度</Text>
                          <Slider
                            min={0}
                            max={100}
                            value={Math.round(activeSlot.opacity * 100)}
                            onChange={(value: number) => updateSlot(side, (slot) => ({ ...slot, opacity: Number(value) / 100 }))}
                          />
                          <InputNumber
                            min={0}
                            max={100}
                            value={Math.round(activeSlot.opacity * 100)}
                            onChange={(value) => updateSlot(side, (slot) => ({ ...slot, opacity: Number(value ?? 50) / 100 }))}
                          />
                        </div>
                        <div className="slider-row">
                          <Text>饱和度</Text>
                          <Slider
                            min={0}
                            max={300}
                            value={Math.round(activeSlot.saturation * 100)}
                            onChange={(value: number) => updateSlot(side, (slot) => ({ ...slot, saturation: Number(value) / 100 }))}
                          />
                          <InputNumber
                            min={0}
                            max={300}
                            value={Math.round(activeSlot.saturation * 100)}
                            onChange={(value) => updateSlot(side, (slot) => ({ ...slot, saturation: Number(value ?? 100) / 100 }))}
                          />
                        </div>
                      </Space>
                    ),
                  },
                ]}
              />

              <Card size="small" className="subtle-card">
                <Space direction="vertical" size={12} className="control-stack">
                  <div>
                    <Text strong>快速文本填充</Text>
                    <Paragraph type="secondary">一行一个精灵名，先生成本地草稿，再保存到阵容。</Paragraph>
                  </div>
                  <TextArea
                    rows={4}
                    value={panel.quickFillInput}
                    onChange={(event) => mutatePanel(side, (prev) => ({ ...prev, quickFillInput: event.target.value }))}
                    placeholder={'暮星辰\n怖哭菇\n龙息帕尔'}
                  />
                  <Space wrap>
                    <Button onClick={() => void runQuickFill(side)}>快速填充</Button>
                    <Button type="primary" onClick={() => void savePanel(side)}>保存到{side === 'left' ? '左侧' : '右侧'}</Button>
                    <Button onClick={() => clearCurrentSlot(side)}>清空当前槽位</Button>
                    <Button onClick={() => clearPanel(side)}>清空全部草稿</Button>
                    <Button danger onClick={() => void deletePanel(side)}>删除已存配置</Button>
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
                          <Text>槽位 {match.slot + 1}：{match.input}</Text>
                          <Space wrap>
                            {match.candidates.map((candidate) => (
                              <Button
                                key={candidate.id}
                                size="small"
                                onClick={() => chooseQuickFillCandidate(side, match.slot, candidate)}
                              >
                                {candidate.displayName}
                              </Button>
                            ))}
                          </Space>
                        </div>
                      ))}
                  </Space>
                </Card>
              ) : null}

              <Card size="small" className="subtle-card">
                <Space direction="vertical" size={12} className="control-stack">
                  <Input
                    value={panel.search}
                    onChange={(event) => mutatePanel(side, (prev) => ({ ...prev, search: event.target.value }))}
                    placeholder={`搜索${side === 'left' ? '左侧' : '右侧'}精灵名称`}
                  />
                  <List
                    grid={{ gutter: 12, xs: 2, sm: 3, md: 4 }}
                    dataSource={filteredSprites.slice(0, 80)}
                    locale={{ emptyText: '没有匹配到精灵' }}
                    renderItem={(sprite) => (
                      <List.Item>
                        <Button className="sprite-card-button" onClick={() => applySprite(side, sprite)}>
                          <Space direction="vertical" size={8} className="sprite-card-inner">
                            <Image
                              preview={false}
                              src={sprite.path}
                              alt={sprite.displayName}
                              className="sprite-card-image"
                            />
                            <Text ellipsis>{sprite.displayName}</Text>
                          </Space>
                        </Button>
                      </List.Item>
                    )}
                  />
                </Space>
              </Card>
            </Space>
          </Col>
        </Row>
      </Card>
    );
  }

  return (
    <Layout className="admin-shell">
      <Sider width={292} breakpoint="lg" collapsedWidth={0} className="admin-sider">
        <div className="brand-block">
          <Text className="eyebrow">Control Room</Text>
          <Title level={3}>洛克王国 PVP 后台</Title>
          <Paragraph type="secondary">
            现在的 `admin` 已切到 React + Ant Design。圆角、间距、表单、列表和弹窗都以设计系统组件为基础。
          </Paragraph>
          <Space wrap>
            <Tag color="gold">TSX</Tag>
            <Tag color="success">Ant Design</Tag>
            <Tag color="processing">Admin Refactor</Tag>
          </Space>
        </div>
        <Card size="small" className="workspace-card">
          <Space direction="vertical" size={10}>
            <Text type="secondary">本地地址</Text>
            <Text strong>{getLocalAddressText(previewSlot)}</Text>
            <Button block onClick={() => void handleCopyLocalAddress()}>
              复制当前地址
            </Button>
            <Button block type="primary" onClick={openLiveControlWindow}>
              打开实时控制页
            </Button>
            <Button block href="/admin-legacy.html" target="_blank">
              打开旧后台备份
            </Button>
          </Space>
        </Card>
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
            <Text className="eyebrow">Admin Migration</Text>
            <Title level={2}>
              {view === 'roster' ? '赛事工作台' : view === 'history' ? '比赛历史' : view === 'scoreboard' ? '显示设置' : view === 'background' ? '背景素材' : view === 'preview' ? '页面预览' : '关于项目'}
            </Title>
            <Paragraph>
              当前端口和预览链接都以本地服务为准。新的后台保留了旧版核心流程，同时改成了设计系统化的 TSX 结构。
            </Paragraph>
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
              <Row gutter={[18, 18]}>
                <Col xs={24} xl={7}>
                  <Card
                    title="比赛列表"
                    extra={<Button type="primary" onClick={() => setCreateMatchOpen(true)}>开一局</Button>}
                  >
                    <List
                      dataSource={matchStore.matches}
                      locale={{ emptyText: '暂无赛事，先创建一场比赛吧。' }}
                      renderItem={(match) => (
                        <List.Item
                          actions={[
                            <Button key="select" type={match.id === activeMatch?.id ? 'primary' : 'default'} onClick={() => void selectMatch(match.id)}>
                              {match.id === activeMatch?.id ? '当前赛事' : '进入'}
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
                  </Card>
                </Col>
                <Col xs={24} xl={17}>
                  <Card title="当前比赛" extra={<Tag color={activeMatch ? getMatchStatusColor(activeMatch.status) : 'default'}>{activeMatch ? getMatchStatusLabel(activeMatch.status) : '未创建'}</Tag>}>
                    {activeMatch ? (
                      <Space direction="vertical" size={18} className="page-stack">
                        {rosterNotice ? (
                          <Alert
                            showIcon
                            closable
                            type={rosterNotice.tone}
                            message={rosterNotice.text}
                            onClose={() => setRosterNotice(null)}
                          />
                        ) : null}
                        <Descriptions column={3} bordered size="small">
                          <Descriptions.Item label="左侧选手">{activeMatch.leftPlayer || '未设置'}</Descriptions.Item>
                          <Descriptions.Item label="比分">
                            <Text strong>{activeMatch.leftScore} : {activeMatch.rightScore}</Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="右侧选手">{activeMatch.rightPlayer || '未设置'}</Descriptions.Item>
                          <Descriptions.Item label="赛制">BO{activeMatch.bestOf}</Descriptions.Item>
                          <Descriptions.Item label="胜者">{activeMatch.winner === 'left' ? '左侧' : activeMatch.winner === 'right' ? '右侧' : '未决'}</Descriptions.Item>
                          <Descriptions.Item label="当前小局">{currentGame ? `第 ${currentGame.gameNumber} 局` : '暂无'}</Descriptions.Item>
                        </Descriptions>
                        <Steps current={progress.current} items={progress.items} responsive />
                        <Form form={matchForm} layout="vertical" onFinish={(values) => void saveMatchMeta(values)}>
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
                          <Space wrap>
                            <Button type="primary" htmlType="submit">保存比赛信息</Button>
                            <Button
                              onClick={() => void runMatchAction('start')}
                              disabled={!currentGame || currentGame.status !== 'pending' || !currentGame.leftLineup.length || !currentGame.rightLineup.length}
                            >
                              开始本次对局
                            </Button>
                            <Button type="dashed" onClick={() => void runMatchAction('winner', { winner: 'left' })} disabled={currentGame?.status !== 'in_progress'}>
                              左侧赢了
                            </Button>
                            <Button type="dashed" onClick={() => void runMatchAction('winner', { winner: 'right' })} disabled={currentGame?.status !== 'in_progress'}>
                              右侧赢了
                            </Button>
                            <Button onClick={() => void runMatchAction('undo')} disabled={!matchStore.history.canUndo}>撤回上一步</Button>
                            <Button onClick={() => void runMatchAction('redo')} disabled={!matchStore.history.canRedo}>取消撤回</Button>
                          </Space>
                        </Form>

                        <Row gutter={[16, 16]}>
                          <Col xs={24} md={8}>
                            <Statistic title="先赢局数" value={winsNeeded(activeMatch.bestOf)} />
                          </Col>
                          <Col xs={24} md={8}>
                            <Statistic title="左侧已选精灵" value={leftPanelSummary.selectedCount} suffix="/ 6" />
                          </Col>
                          <Col xs={24} md={8}>
                            <Statistic title="右侧已选精灵" value={rightPanelSummary.selectedCount} suffix="/ 6" />
                          </Col>
                        </Row>

                        <Alert
                          type="info"
                          showIcon
                          message="迁移说明"
                          description={`旧版 admin 的赛事流已经切到新的 TSX 后台。当前小局：${currentGame ? `第 ${currentGame.gameNumber} 局` : '未开始'}，双方阵容保存后即可直接沿用原有接口同步到推流页。比赛开始后，阵容微调会继续走原有后端接口。`}
                        />
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
                          const leftEntries = buildHistoryLineupEntries(game, 'left', spriteMap);
                          const rightEntries = buildHistoryLineupEntries(game, 'right', spriteMap);
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
                              </Space>
                              <Row gutter={[16, 16]}>
                                <Col xs={24} xl={12}>
                                  <Space direction="vertical" size={10} className="control-stack">
                                    <Space wrap>
                                      <Text strong>左侧阵容</Text>
                                      {leftLost ? <Tag color="default">本局失利</Tag> : null}
                                    </Space>
                                    <div className="history-team-grid">
                                      {leftEntries.map((entry, index) => (
                                        <Card
                                          key={`${record.id}-${game.gameNumber}-left-${index}`}
                                          size="small"
                                          className={`history-slot-card${leftLost ? ' is-lost' : ''}${!entry ? ' is-empty' : ''}`}
                                        >
                                          <Space direction="vertical" size={8} className="history-slot-stack">
                                            {entry?.path ? (
                                              <Image
                                                preview={false}
                                                src={entry.path}
                                                alt={entry.name}
                                                className="history-slot-image"
                                                fallback="/assets/ui/back.png"
                                              />
                                            ) : (
                                              <div className="history-slot-fallback">未上阵</div>
                                            )}
                                            <Text ellipsis>{entry?.name ?? '未上阵'}</Text>
                                          </Space>
                                        </Card>
                                      ))}
                                    </div>
                                  </Space>
                                </Col>
                                <Col xs={24} xl={12}>
                                  <Space direction="vertical" size={10} className="control-stack">
                                    <Space wrap>
                                      <Text strong>右侧阵容</Text>
                                      {rightLost ? <Tag color="default">本局失利</Tag> : null}
                                    </Space>
                                    <div className="history-team-grid">
                                      {rightEntries.map((entry, index) => (
                                        <Card
                                          key={`${record.id}-${game.gameNumber}-right-${index}`}
                                          size="small"
                                          className={`history-slot-card${rightLost ? ' is-lost' : ''}${!entry ? ' is-empty' : ''}`}
                                        >
                                          <Space direction="vertical" size={8} className="history-slot-stack">
                                            {entry?.path ? (
                                              <Image
                                                preview={false}
                                                src={entry.path}
                                                alt={entry.name}
                                                className="history-slot-image"
                                                fallback="/assets/ui/back.png"
                                              />
                                            ) : (
                                              <div className="history-slot-fallback">未上阵</div>
                                            )}
                                            <Text ellipsis>{entry?.name ?? '未上阵'}</Text>
                                          </Space>
                                        </Card>
                                      ))}
                                    </div>
                                  </Space>
                                </Col>
                              </Row>
                            </Space>
                          </Card>
                          );
                        })}
                      </Space>
                    ),
                  }}
                  locale={{ emptyText: '暂无历史赛事' }}
                />
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
                      { value: 'standby', label: '等待页 Demo' },
                    ]}
                    onChange={(value) => setPreviewSlot(value as PreviewSlotKey)}
                  />
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Card size="small" className="subtle-card">
                        <Statistic title="本地部署地址" value={getLocalAddressText(previewSlot)} />
                        <Divider />
                        <Button block onClick={() => void handleCopyLocalAddress()}>复制地址</Button>
                      </Card>
                    </Col>
                    <Col xs={24} md={12}>
                      <Card size="small" className="subtle-card">
                        <Statistic title="完整预览链接" value={buildPreviewUrl(previewSlot)} />
                        <Divider />
                        <Button block onClick={() => void handleCopyPreviewLink()}>复制链接</Button>
                      </Card>
                    </Col>
                  </Row>
                  <div className="preview-frame-shell">
                    <iframe title="preview" className="preview-frame" src={buildPreviewUrl(previewSlot)} />
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
                      <Link href="/admin.html" target="_blank">当前后台入口</Link>
                      <Link href="/admin-legacy.html" target="_blank">旧后台备份</Link>
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
          initialValues={{ bestOf: 3 }}
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
        </Form>
      </Modal>

      <Modal
        title="编辑赛事标签"
        open={tagEditorOpen}
        onCancel={() => setTagEditorOpen(false)}
        onOk={() => tagForm.submit()}
        okText="保存标签"
        cancelText="取消"
      >
        <Form form={tagForm} layout="vertical" onFinish={(values) => void saveTags(values)}>
          <Form.Item label="标签（逗号分隔，最多 10 个）" name="tags">
            <Input placeholder="例如：淘汰赛, 决赛, 焦点战" />
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

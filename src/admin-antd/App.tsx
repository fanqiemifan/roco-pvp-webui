/*
This project uses Ant Design (https://ant.design), licensed under the MIT License.
*/
import React, { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
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
  Timeline,
  Typography,
  Upload,
} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { io } from 'socket.io-client';

import { SOCKET_EVENTS } from '../../shared/events';
import type {
  AvatarCollectionState,
  MatchRecord,
  MatchStoreState,
  Page4PanelState,
  Page4SlotState,
  Page4State,
  PanelState,
  ScoreboardState,
  SlotState,
  SpriteRecord,
  StageConfig,
  StagePageKey,
  StageTransitionType,
} from '../../shared/types';

import {
  DEFAULT_TAGS,
  EXCLUSIVE_FORM_FILTERS,
  STAGE_OPTIONS,
  STAGE_TRANSITION_OPTIONS,
  normalizeStagePage,
  normalizeStageTransition,
  theme,
} from './constants';
import { StageThumb } from './components/StageThumb';
import { formatDateTime } from './lib/format';
import {
  buildHistoryBattleEntries,
  buildHistoryCsv,
  buildHistoryLineupEntries,
  buildHistoryTags,
  getVisibleGames,
} from './lib/history';
import {
  clampNumber,
  extractLiveConfigPanel,
  findConfigTargetIndex,
  getEnergyLevel,
  getHealthLevel,
  readNumberField,
  stringifyLiveConfig,
} from './lib/live';
import {
  buildProgressItems,
  getActiveMatch,
  getCurrentGame,
  getGameResultLabel,
  getGameStatusLabel,
  getMatchStatusColor,
  getMatchStatusLabel,
  getNoticeTagColor,
  summarizeSeriesForBestOf,
} from './lib/match';
import {
  buildPage4Request,
  buildPanelRequest,
  clonePage4Selected,
  cloneSelected,
  createDefaultSpriteFilterState,
  createEmptySlot,
  createPage4EmptySlot,
  createPage4PanelEditorState,
  createPanelEditorState,
  createSpriteFilterState,
  page4PanelStateToSelected,
  panelStateToSelected,
} from './lib/panel';
import { buildPreviewUrl, getLocalAddressText, getPreviewPage } from './lib/preview';
import { copyText, requestJson, requestQuickFillMatches, uploadSingleFile } from './lib/request';
import { buildSpriteLookup } from './lib/sprite';
import { Page4DeathPanel } from './views/Page4DeathPanel';
import { Page4PanelEditor } from './views/Page4PanelEditor';
import { RosterPanelEditor } from './views/RosterPanelEditor';
import { StatsView } from './views/StatsView';

import type { StatsMetricKey, StatsRangeKey } from './lib/stats';
import type {
  CreateMatchValues,
  LiveField,
  MatchFormValues,
  NoticeState,
  Page4PanelEditorState,
  PanelEditorState,
  PanelSide,
  PreviewSlotKey,
  ScoreboardFormValues,
  SpriteFilterState,
  ViewKey,
} from './types';

const { Header, Sider, Content } = Layout;
const { Title, Paragraph, Text, Link } = Typography;
const { TextArea } = Input;

const CHANGELOG: Array<{ version: string; date: string; items: string[] }> = [
  {
    version: '1.5.1',
    date: '2026-08',
    items: [
      '新增桌面阵容悬浮窗：透明置顶小窗实时展示双方阵容，点击精灵可设置阵亡（HP=0）/复活，悬浮时显示关闭按钮',
      '右键精灵可按文件名基名匹配同系列多形态（如 岚鸟-1/-2）并一键切换，或打开更换精灵小窗；更换窗自动定位到精灵上方、更换后自动关闭、同时仅保留一个',
      '选手头像系统：头像按赛事隔离存储；赛事面板点击头像即可更换（64×64 圆形 + 1px 内描边）；创建赛事弹窗可设置选手头像；上传头像服务端等比缩放压缩为 128×128 PNG',
      '数据统计增强：属性分布胶囊化并显示属性图标；列头悬浮说明口径；前三名金/银/铜徽章；新增「胜场」字段；支持搜索选择选手与赛事标签；排行卡片加宽',
      '推流页：页面2赛事标题默认为空、未输入时推流页不显示；页面2阵容展示默认「仅头像展示」',
      '比赛列表比分胶囊化、列表高度显示 5 条；创建赛事弹窗比赛赛制标记为必填',
      '配置 antd 中文 locale，内置文本（如“点击排序”）本地化；Docker 登录密码改为 123',
      '修复：缩略图文件名零宽空格导致霹雳迪迪未使用缩略图；多形态列表显示精灵原始名称（如 卡瓦重（草地附近的样子））',
    ],
  },
  {
    version: '1.5.0',
    date: '',
    items: [
      '新增直播推流（导播台）：实时 iframe 缩略预览、页面切换、百叶窗/缩放冲击过渡动效、黑场/等待页',
      '推流页面 1 改为 page4 式阵容展示并使用赛事面板数据',
      '头像上传增加魔数校验，杜绝同源存储型 XSS',
      '内置 Alibaba PuHuiTi 2.0 字体，修复精灵名字依赖系统字体导致变形',
    ],
  },
  {
    version: '1.4.0',
    date: '',
    items: [
      '管理后台重构：拆分 App.tsx，纯逻辑下沉 lib/、常量类型独立、视图组件化',
      '新增数据统计页：按赛事历史聚合精灵使用率/上场率/胜率/属性分布/登场趋势',
      '比赛历史支持 CSV 导出，阵容精灵名统一使用 sprites.json 精灵名称',
      '新增页面4（仅显阵容）与快速填充阵容功能',
    ],
  },
  {
    version: '1.3.0',
    date: '',
    items: [
      '赛事管理：创建赛事、BO 赛制、逐小局记录胜负、撤销/重做、历史与删除',
      '阵容编辑：左右两侧独立配置，调节血量/能量/透明度/饱和度，精灵筛选（属性/形态/最终形态）',
      '推流页面 2 / 3 与赛事标题、比分栏、头像设置',
      '新增后台账号密码登录验证与单会话管理',
    ],
  },
];

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
  const [avatars, setAvatars] = useState<AvatarCollectionState>({
    left: { side: 'left', exists: false },
    right: { side: 'right', exists: false },
  });
  const [createLeftAvatar, setCreateLeftAvatar] = useState<File | null>(null);
  const [createRightAvatar, setCreateRightAvatar] = useState<File | null>(null);
  const [createLeftAvatarUrl, setCreateLeftAvatarUrl] = useState<string | null>(null);
  const [createRightAvatarUrl, setCreateRightAvatarUrl] = useState<string | null>(null);
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
  const [statsRange, setStatsRange] = useState<StatsRangeKey>('7d');
  const [statsMetric, setStatsMetric] = useState<StatsMetricKey>('pickRate');
  const [statsPlayer, setStatsPlayer] = useState<string | null>(null);
  const [statsTag, setStatsTag] = useState<string | null>(null);
  const [statsSearch, setStatsSearch] = useState('');
  const [previewSlot, setPreviewSlot] = useState<PreviewSlotKey>('stage');
  const [previewScale, setPreviewScale] = useState(1);
  const [previewShellSize, setPreviewShellSize] = useState({ width: 960, height: 540 });
  const [stage, setStage] = useState<StageConfig | null>(null);
  const [stageSaving, setStageSaving] = useState(false);
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
    avatars?: AvatarCollectionState;
    panels?: PanelState[];
    panel?: PanelState;
    page4?: Page4State;
    page4Panel?: Page4PanelState;
    stage?: StageConfig;
  }) {
    startTransition(() => {
      if (payload.scoreboard) {
        setScoreboard(payload.scoreboard);
      }
      if (payload.matches) {
        setMatchStore(payload.matches);
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
      if (payload.stage) {
        setStage(payload.stage);
      }
    });
  }

  async function loadInitialData(showToast = false) {
    setRefreshing(true);
    setPageError('');

    try {
      const [auth, nextScoreboard, nextMatches, nextAvatars, nextPanels, nextPage4, nextSprites, nextStage] = await Promise.all([
        requestJson<{ authenticated: boolean }>('/api/auth/check'),
        requestJson<ScoreboardState>('/api/scoreboard'),
        requestJson<MatchStoreState>('/api/matches'),
        requestJson<AvatarCollectionState>('/api/avatars'),
        requestJson<{ images: [PanelState, PanelState] }>('/api/images'),
        requestJson<Page4State>('/api/page4'),
        requestJson<{ sprites: SpriteRecord[] }>('/api/sprites'),
        requestJson<StageConfig>('/api/stage'),
      ]);

      if (!auth.authenticated) {
        window.location.href = '/login.html';
        return;
      }

      startTransition(() => {
        setScoreboard(nextScoreboard);
        setMatchStore(nextMatches);
        setAvatars(nextAvatars);
        setSprites(nextSprites.sprites);
        setStage(nextStage);
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

    socket.on(SOCKET_EVENTS.avatarUpdate, (payload) => {
      if (payload?.avatars) {
        applyServerState({ avatars: payload.avatars });
      }
    });

    socket.on(SOCKET_EVENTS.stageUpdate, (payload) => {
      if (payload?.stage) {
        applyServerState({ stage: payload.stage });
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
      const matches = await requestQuickFillMatches(text);

      const nextSelected = Array.from({ length: 6 }, (_, index) => createEmptySlot(index));
      matches.forEach((match) => {
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
        quickFillMatches: matches,
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
        const nextText = `${side === 'left' ? '左侧' : '右侧'} 仅显阵容已保存`;
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
      quickFillMatches: [],
      dirty: true,
    }));
  }

  async function runPage4QuickFill(side: PanelSide) {
    const text = page4Panels[side].quickFillInput.trim();
    if (!text) {
      message.warning('请先输入要匹配的精灵名称');
      return;
    }

    try {
      const matches = await requestQuickFillMatches(text);
      const nextSelected = Array.from({ length: 6 }, (_, index) => createPage4EmptySlot(index));
      matches.forEach((match) => {
        if (match.slot >= 0 && match.slot < 6 && match.sprite) {
          nextSelected[match.slot] = {
            ...nextSelected[match.slot],
            sprite: match.sprite,
          };
        }
      });

      mutatePage4Panel(side, (panel) => ({
        ...panel,
        selected: nextSelected,
        quickFillMatches: matches,
        dirty: true,
      }));
      message.success(`${side === 'left' ? '左侧' : '右侧'} 仅显阵容快速填充已应用到本地草稿`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  function choosePage4QuickFillCandidate(side: PanelSide, slotIndex: number, sprite: SpriteRecord) {
    mutatePage4Panel(side, (panel) => {
      const selected = clonePage4Selected(panel.selected);
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

  function updatePage4SlotAt(side: PanelSide, slotIndex: number, updater: (slot: Page4SlotState) => Page4SlotState) {
    mutatePage4Panel(side, (panel) => {
      const selected = clonePage4Selected(panel.selected);
      const current = selected[slotIndex] ?? createPage4EmptySlot(slotIndex);
      selected[slotIndex] = updater(current);
      return {
        ...panel,
        selected,
        dirty: true,
      };
    });
  }

  function applyPage4Sprite(side: PanelSide, sprite: SpriteRecord) {
    updatePage4Slot(side, (slot) => ({
      ...slot,
      sprite,
    }));
  }

  function togglePage4DeadAt(side: PanelSide, slotIndex: number) {
    updatePage4SlotAt(side, slotIndex, (slot) => (slot.sprite ? {
      ...slot,
      isDead: !slot.isDead,
    } : slot));
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
      const nextAvatars = await requestJson<AvatarCollectionState>('/api/avatars');
      setAvatars(nextAvatars);
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
      // 新赛事创建后即为当前赛事，头像按赛事隔离上传到新赛事下
      if (createLeftAvatar) {
        await uploadSingleFile('/api/upload/avatar/left', createLeftAvatar);
      }
      if (createRightAvatar) {
        await uploadSingleFile('/api/upload/avatar/right', createRightAvatar);
      }
      if (createLeftAvatar || createRightAvatar) {
        const nextAvatars = await requestJson<AvatarCollectionState>('/api/avatars');
        setAvatars(nextAvatars);
      }
      setCreateMatchOpen(false);
      createMatchForm.resetFields();
      clearCreateAvatars();
      setRosterNotice({ tone: 'success', text: '新赛事已创建，系统已自动切到第 1 局草稿' });
      message.success('新赛事已创建');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }

  function getAvatarPreviewSrc(side: PanelSide): string {
    const avatar = avatars[side];
    return avatar.exists
      ? `${avatar.path}?t=${avatar.mtime ?? Date.now()}`
      : side === 'left'
        ? '/assets/ui/left-avatar.png'
        : '/assets/ui/right-avatar.png';
  }

  function pickCreateAvatar(side: PanelSide, file: File) {
    if (side === 'left') {
      if (createLeftAvatarUrl) URL.revokeObjectURL(createLeftAvatarUrl);
      setCreateLeftAvatar(file);
      setCreateLeftAvatarUrl(URL.createObjectURL(file));
    } else {
      if (createRightAvatarUrl) URL.revokeObjectURL(createRightAvatarUrl);
      setCreateRightAvatar(file);
      setCreateRightAvatarUrl(URL.createObjectURL(file));
    }
  }

  function clearCreateAvatars() {
    if (createLeftAvatarUrl) URL.revokeObjectURL(createLeftAvatarUrl);
    if (createRightAvatarUrl) URL.revokeObjectURL(createRightAvatarUrl);
    setCreateLeftAvatar(null);
    setCreateRightAvatar(null);
    setCreateLeftAvatarUrl(null);
    setCreateRightAvatarUrl(null);
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

  async function saveStage(
    nextPage: StagePageKey,
    options?: { silent?: boolean; transition?: StageTransitionType },
  ) {
    const silent = options?.silent ?? false;
    const normalized = normalizeStagePage(nextPage);
    const transition = normalizeStageTransition(options?.transition ?? stage?.transition);
    // 乐观更新，避免切换回弹
    setStage((prev) => (prev ? { ...prev, page: normalized, transition } : prev));
    setStageSaving(true);
    try {
      const data = await requestJson<{ success: boolean; stage: StageConfig }>('/api/stage', {
        method: 'POST',
        json: { page: normalized, transition },
      });
      applyServerState({ stage: data.stage });
      if (!silent) {
        message.success(`已切换到：${STAGE_OPTIONS.find((option) => option.value === data.stage.page)?.label ?? data.stage.page}`);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
      // 失败时回滚到当前已知值
      try {
        const fresh = await requestJson<StageConfig>('/api/stage');
        setStage(fresh);
      } catch {
        // ignore
      }
    } finally {
      setStageSaving(false);
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

  async function handleCopyStageLocalAddress() {
    const host = window.location.port ? `127.0.0.1:${window.location.port}` : '127.0.0.1';
    try {
      await copyText(`${host}/`);
      message.success('推流页地址已复制');
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
    { key: 'stage', label: '直播推流' },
    { key: 'live', label: '实时控制' },
    { key: 'history', label: '比赛历史' },
    { key: 'stats', label: '数据统计' },
    { key: 'scoreboard', label: '显示设置' },
    { key: 'preview', label: '页面预览' },
    { key: 'page4', label: '仅显阵容' },
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

  function exportHistoryCsv() {
    const csv = buildHistoryCsv(filteredMatches, spriteMap);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '比赛历史.csv';
    link.click();
    URL.revokeObjectURL(url);
    message.success(`已导出 ${filteredMatches.length} 场赛事历史`);
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
              {view === 'roster' ? '赛事工作台' : view === 'live' ? '实时控制' : view === 'page4' ? '仅显阵容' : view === 'history' ? '比赛历史' : view === 'stats' ? '数据统计' : view === 'scoreboard' ? '显示设置' : view === 'stage' ? '直播推流' : view === 'preview' ? '页面预览' : '关于项目'}
            </Title>
          </div>
          <Space wrap>
            <Button
              onClick={() => {
                if (window.rocoFloat?.toggle) {
                  window.rocoFloat.toggle();
                } else {
                  window.open('/float.html', '_blank');
                }
              }}
            >
              阵容悬浮窗
            </Button>
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
                                  <Tag bordered={false} className="match-list-score-tag">{match.leftScore} : {match.rightScore}</Tag>
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
                            <div className="player-avatar-wrap">
                              <Upload
                                showUploadList={false}
                                beforeUpload={(file) => {
                                  void uploadAvatarFile('left', file as File);
                                  return false;
                                }}
                              >
                                <div className="player-avatar-circular current-match-player-avatar">
                                  <Image preview={false} src={getAvatarPreviewSrc('left')} alt="左侧选手头像" />
                                  <span className="player-avatar-hint">更换</span>
                                </div>
                              </Upload>
                              {avatars.left.exists ? (
                                <Button
                                  className="player-avatar-delete"
                                  size="small"
                                  danger
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void deleteAvatarFile('left');
                                  }}
                                >
                                  删除
                                </Button>
                              ) : null}
                            </div>
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
                            <div className="player-avatar-wrap">
                              <Upload
                                showUploadList={false}
                                beforeUpload={(file) => {
                                  void uploadAvatarFile('right', file as File);
                                  return false;
                                }}
                              >
                                <div className="player-avatar-circular current-match-player-avatar">
                                  <Image preview={false} src={getAvatarPreviewSrc('right')} alt="右侧选手头像" />
                                  <span className="player-avatar-hint">更换</span>
                                </div>
                              </Upload>
                              {avatars.right.exists ? (
                                <Button
                                  className="player-avatar-delete"
                                  size="small"
                                  danger
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void deleteAvatarFile('right');
                                  }}
                                >
                                  删除
                                </Button>
                              ) : null}
                            </div>
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
                <Col xs={24} xl={12}>
                  <RosterPanelEditor
                    side="left"
                    panel={panels.left}
                    filter={spriteFilters.left}
                    locked={lineupLocked}
                    searchValue={deferredLeftSearch}
                    sprites={sprites}
                    spriteFormOptions={spriteFormOptions}
                    onMutatePanel={mutatePanel}
                    onSavePanel={savePanel}
                    onRunQuickFill={runQuickFill}
                    onClearCurrentSlot={clearCurrentSlot}
                    onClearPanel={clearPanel}
                    onChooseQuickFillCandidate={chooseQuickFillCandidate}
                    onApplySprite={applySprite}
                    onClearSpriteFilters={clearSpriteFilters}
                    onToggleAttributeFilter={toggleAttributeFilter}
                    onToggleFinalFormFilter={toggleFinalFormFilter}
                    onToggleFormFilter={toggleFormFilter}
                  />
                </Col>
                <Col xs={24} xl={12}>
                  <RosterPanelEditor
                    side="right"
                    panel={panels.right}
                    filter={spriteFilters.right}
                    locked={lineupLocked}
                    searchValue={deferredRightSearch}
                    sprites={sprites}
                    spriteFormOptions={spriteFormOptions}
                    onMutatePanel={mutatePanel}
                    onSavePanel={savePanel}
                    onRunQuickFill={runQuickFill}
                    onClearCurrentSlot={clearCurrentSlot}
                    onClearPanel={clearPanel}
                    onChooseQuickFillCandidate={chooseQuickFillCandidate}
                    onApplySprite={applySprite}
                    onClearSpriteFilters={clearSpriteFilters}
                    onToggleAttributeFilter={toggleAttributeFilter}
                    onToggleFinalFormFilter={toggleFinalFormFilter}
                    onToggleFormFilter={toggleFormFilter}
                  />
                </Col>
              </Row>
            </Space>
          ) : null}

          {view === 'page4' ? (
            <Space direction="vertical" size={18} className="page-stack">
              <Page4DeathPanel
                page4Panels={page4Panels}
                onTogglePage4DeadAt={togglePage4DeadAt}
              />
              <Row gutter={[18, 18]}>
                <Col xs={24} xl={12}>
                  <Page4PanelEditor
                    side="left"
                    panel={page4Panels.left}
                    filter={page4SpriteFilters.left}
                    notice={page4Notice}
                    searchValue={deferredPage4LeftSearch}
                    sprites={sprites}
                    spriteFormOptions={spriteFormOptions}
                    onMutatePanel={mutatePage4Panel}
                    onDismissNotice={() => setPage4Notice(null)}
                    onSavePanel={savePage4Panel}
                    onRunQuickFill={runPage4QuickFill}
                    onClearCurrentSlot={clearPage4CurrentSlot}
                    onClearPanel={clearPage4Panel}
                    onChooseQuickFillCandidate={choosePage4QuickFillCandidate}
                    onApplySprite={applyPage4Sprite}
                    onClearSpriteFilters={clearPage4SpriteFilters}
                    onToggleAttributeFilter={togglePage4AttributeFilter}
                    onToggleFinalFormFilter={togglePage4FinalFormFilter}
                    onToggleFormFilter={togglePage4FormFilter}
                  />
                </Col>
                <Col xs={24} xl={12}>
                  <Page4PanelEditor
                    side="right"
                    panel={page4Panels.right}
                    filter={page4SpriteFilters.right}
                    notice={page4Notice}
                    searchValue={deferredPage4RightSearch}
                    sprites={sprites}
                    spriteFormOptions={spriteFormOptions}
                    onMutatePanel={mutatePage4Panel}
                    onDismissNotice={() => setPage4Notice(null)}
                    onSavePanel={savePage4Panel}
                    onRunQuickFill={runPage4QuickFill}
                    onClearCurrentSlot={clearPage4CurrentSlot}
                    onClearPanel={clearPage4Panel}
                    onChooseQuickFillCandidate={choosePage4QuickFillCandidate}
                    onApplySprite={applyPage4Sprite}
                    onClearSpriteFilters={clearPage4SpriteFilters}
                    onToggleAttributeFilter={togglePage4AttributeFilter}
                    onToggleFinalFormFilter={togglePage4FinalFormFilter}
                    onToggleFormFilter={togglePage4FormFilter}
                  />
                </Col>
              </Row>
            </Space>
          ) : null}

          {view === 'history' ? (
            <Space direction="vertical" size={18} className="page-stack">
              <Card
                title="比赛历史"
                extra={(
                  <Space wrap>
                    <Button onClick={exportHistoryCsv} disabled={!filteredMatches.length}>导出 CSV</Button>
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

          {view === 'stats' ? (
            <StatsView
              matches={matchStore.matches}
              spriteMap={spriteMap}
              range={statsRange}
              metric={statsMetric}
              player={statsPlayer}
              tag={statsTag}
              search={statsSearch}
              onRangeChange={setStatsRange}
              onMetricChange={setStatsMetric}
              onPlayerChange={setStatsPlayer}
              onTagChange={setStatsTag}
              onSearchChange={setStatsSearch}
            />
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
                    <Col xs={24} md={12} xl={12}>
                      <Card size="small" className="subtle-card" title="比分栏显示">
                        <Space direction="vertical" size={14} className="control-stack">
                          <Form.Item label="顶部比分栏显示" name="scoreboardEnabled" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Space>
                      </Card>
                    </Col>
                    <Col xs={24} md={12} xl={12}>
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

          {view === 'stage' ? (
            <Space direction="vertical" size={18} className="page-stack">
              <Card
                className="stage-control-card"
                title="直播推流"
                extra={
                  <Space wrap>
                    <Button href="/" target="_blank">打开推流页面</Button>
                    <Button onClick={handleCopyStageLocalAddress}>复制推流页地址</Button>
                  </Space>
                }
              >
                <Space direction="vertical" size={16} className="page-stack">
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    推流软件（OBS 等）只需固定捕获根路径 <code>/</code>。在此切换后，推流页面会实时加载所选画面，无需修改推流来源。
                  </Paragraph>
                  <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>切换过渡效果：</Text>
                    <Segmented
                      block
                      value={normalizeStageTransition(stage?.transition)}
                      disabled={stageSaving}
                      options={STAGE_TRANSITION_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                      onChange={(value) => { void saveStage(stage?.page ?? 'page3', { transition: value as StageTransitionType }); }}
                    />
                  </div>
                  <Segmented
                    block
                    value={stage?.page ?? 'page3'}
                    disabled={stageSaving}
                    options={STAGE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                    onChange={(value) => { void saveStage(value as StagePageKey); }}
                  />
                  <Row gutter={[16, 16]}>
                    {STAGE_OPTIONS.map((option) => {
                      const active = (stage?.page ?? null) === option.value;
                      const isBlank = option.value === 'blank';
                      return (
                        <Col xs={24} sm={12} md={8} key={option.value}>
                          <Card
                            size="small"
                            hoverable
                            className={`stage-card ${active ? 'stage-card-active' : ''} ${isBlank ? 'stage-card-blank' : ''}`}
                            onClick={() => void saveStage(option.value)}
                          >
                            <Space direction="vertical" size={6} className="page-stack" style={{ width: '100%' }}>
                              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                                <Text strong>{option.label}</Text>
                                {active ? <Tag color="green">当前画面</Tag> : null}
                              </Space>
                              <Text type="secondary" style={{ fontSize: 12 }}>{option.description}</Text>
                              {isBlank ? (
                                <div className="stage-card-thumb stage-card-thumb-blank">
                                  <span className="stage-card-thumb-mark">黑场</span>
                                </div>
                              ) : (
                                <StageThumb label={option.label} previewPath={option.previewPath} />
                              )}
                            </Space>
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                </Space>
              </Card>
            </Space>
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
                      { value: 'stage', label: '直播推流' },
                      { value: 'page1', label: '推流页面1' },
                      { value: 'page2', label: '推流页面2' },
                      { value: 'page3', label: '推流页面3' },
                      { value: 'page4', label: '仅显阵容' },
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
              <Card title="项目链接">
                <Space wrap size={12}>
                  <Link href="/login.html" target="_blank">登录页入口</Link>
                  <Link href="/admin.html" target="_blank">当前后台入口</Link>
                  <Link href="/roco-pvp-page2.html" target="_blank">推流页面 2</Link>
                  <Link href="https://wiki.biligame.com/rocom/" target="_blank">精灵图素材来源</Link>
                  <Link href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans" target="_blank">CC BY-NC-SA 4.0</Link>
                </Space>
              </Card>
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
                            <Paragraph type="secondary">头像、推流页面 1/2/3 和等待页都能在后台里一起管理。</Paragraph>
                          </Card>
                        </Col>
                      </Row>
                      <Card size="small" className="subtle-card" title="更新日志">
                        <Timeline
                          items={CHANGELOG.map((entry) => ({
                            color: entry.version === '1.5.1' ? 'gold' : 'gray',
                            children: (
                              <Space direction="vertical" size={4}>
                                <Space wrap>
                                  <Text strong>v{entry.version}</Text>
                                  {entry.date ? <Text type="secondary">{entry.date}</Text> : null}
                                </Space>
                                <ul className="changelog-list">
                                  {entry.items.map((item) => (
                                    <li key={item}>
                                      <Text type="secondary">{item}</Text>
                                    </li>
                                  ))}
                                </ul>
                              </Space>
                            ),
                          }))}
                        />
                      </Card>
                    </Space>
                  </Card>
            </Space>
          ) : null}
        </Content>
      </Layout>

      <Modal
        title="创建赛事"
        open={createMatchOpen}
        onCancel={() => {
          setCreateMatchOpen(false);
          clearCreateAvatars();
        }}
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
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Form.Item label="左侧选手头像（留空则使用默认）">
                <div className="create-avatar-row">
                  <div className="player-avatar-circular">
                    {createLeftAvatarUrl ? (
                      <img src={createLeftAvatarUrl} alt="左侧头像预览" />
                    ) : (
                      <Image preview={false} src="/assets/ui/left-avatar.png" alt="左侧头像预览" />
                    )}
                  </div>
                  <Upload
                    showUploadList={false}
                    beforeUpload={(file) => {
                      pickCreateAvatar('left', file as File);
                      return false;
                    }}
                  >
                    <Button>选择头像</Button>
                  </Upload>
                </div>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="右侧选手头像（留空则使用默认）">
                <div className="create-avatar-row">
                  <div className="player-avatar-circular">
                    {createRightAvatarUrl ? (
                      <img src={createRightAvatarUrl} alt="右侧头像预览" />
                    ) : (
                      <Image preview={false} src="/assets/ui/right-avatar.png" alt="右侧头像预览" />
                    )}
                  </div>
                  <Upload
                    showUploadList={false}
                    beforeUpload={(file) => {
                      pickCreateAvatar('right', file as File);
                      return false;
                    }}
                  >
                    <Button>选择头像</Button>
                  </Upload>
                </div>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="比赛赛制" name="bestOf" rules={[{ required: true, message: '请选择比赛赛制' }]}>
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
    <ConfigProvider theme={theme} locale={zhCN}>
      <App>
        <Dashboard />
      </App>
    </ConfigProvider>
  );
}

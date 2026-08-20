export interface SpriteRecord {
  id: string;
  filename: string;
  displayName: string;
  name: string;
  chineseName: string;
  cardName: string;
  path: string;
  aliases: string[];
  number: number | null;
  variant: number;
  attribute: string;
  attributeCodes: string[];
  attributeIcon1: string;
  attributeIcon2: string;
  thumbnailId: string;
  form: string;
  isFinalForm: boolean;
}

export interface SlotState {
  slot: number;
  sprite: SpriteRecord | null;
  opacityEnabled: boolean;
  opacity: number;
  effectiveOpacity: number;
  saturation: number;
  healthEnabled: boolean;
  healthPercent: number;
  energyValue: number;
}

export interface PanelState {
  position: 'left' | 'right';
  count: number;
  selected: SlotState[];
  mtime: number | null;
}

export interface Page4SlotState {
  slot: number;
  sprite: SpriteRecord | null;
  isDead: boolean;
}

export interface Page4PanelState {
  position: 'left' | 'right';
  count: number;
  selected: Page4SlotState[];
  mtime: number | null;
}

export interface Page4State {
  panels: [Page4PanelState, Page4PanelState];
  mtime: number | null;
}

export interface ScoreboardState {
  leftName: string;
  leftScore: string;
  rightName: string;
  rightScore: string;
  bestOf: number;
  scoreboardEnabled: boolean;
  eventTitle: string;
  eventTitleEnabled: boolean;
  page2LineupDisplayMode: 'default' | 'avatar-only';
  page5Title: string;
  page6Title: string;
  nameFontSize: number;
  scoreFontSize: number;
  mtime: number | null;
}

export type Page6Background = 'image' | 'image-2' | 'video';

export interface MatchSlotSnapshot {
  slot: number;
  spriteId: string | null;
  opacityEnabled: boolean;
  opacity: number;
  saturation: number;
  healthEnabled: boolean;
  healthPercent: number;
  energyValue: number;
}

export interface GameRecord {
  gameNumber: number;
  leftLineup: string[];
  rightLineup: string[];
  leftSlots: MatchSlotSnapshot[];
  rightSlots: MatchSlotSnapshot[];
  winner: 'left' | 'right' | null;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface MatchRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'in_progress' | 'completed';
  leftPlayer: string;
  rightPlayer: string;
  bestOf: number;
  games: GameRecord[];
  leftScore: number;
  rightScore: number;
  winner: 'left' | 'right' | null;
  completedAt: string | null;
  tags: string[];
}

export interface MatchStoreState {
  activeMatchId: string | null;
  matches: MatchRecord[];
  history: {
    canUndo: boolean;
    canRedo: boolean;
    canUndoDelete: boolean;
    deleteUndoCount: number;
  };
  mtime: number | null;
}

export interface AvatarState {
  side: 'left' | 'right';
  exists: boolean;
  path?: string;
  size?: number;
  mtime?: number;
}

export interface AvatarCollectionState {
  left: AvatarState;
  right: AvatarState;
}

/**
 * 直播推流画面 key：决定推流载体页（index.html）要加载哪个推流页面。
 * - page1-overlay: 推流页面1（Overlay 比分栏布局）
 * - page2: 推流页面2（全局阵容展示）
 * - page3: 推流页面3（头像比分阵容）
 * - page5: 推流页面5（使用率/胜率排行）
 * - page6: 推流页面6（比赛结果）
 * - page7: 推流页面7（等待页）
 * - blank: 黑场（不加载任何画面）
 */
export type StagePageKey =
  | 'page1-overlay'
  | 'page2'
  | 'page3'
  | 'page5'
  | 'page6'
  | 'page7'
  | 'blank';

export type StageTransitionType = 'none' | 'blinds' | 'zoom';
export type Page3SpriteSource = 'sprite' | 'thumbnail';

export interface StageConfig {
  page: StagePageKey;
  transition: StageTransitionType;
  /** 推流页面3：精灵主体图片来源 */
  page3SpriteSource: Page3SpriteSource;
  /** 推流页面5：选手过滤（空字符串 = 全部选手） */
  page5Player: string;
  /** 推流页面5：赛事标签过滤（空字符串 = 全部标签） */
  page5Tag: string;
  mtime: number | null;
}

/**
 * 比赛结果（page6）状态：展示哪些已结束的比赛，以及副标题（标题2）。
 */
export interface Page6State {
  /** 已选中的已结束比赛 id（最多 8 个，顺序即展示顺序） */
  matchIds: string[];
  /** 标题2 内容（后端输入，空字符串则隐藏） */
  title: string;
  /** 页面6背景类型：默认图片、备用图片或视频 */
  background: Page6Background;
  mtime: number | null;
}

/**
 * 下一局比赛（page3 下场对局）配置：
 * - matchId：所选待开始比赛
 * - visible：当前是否正在显示
 * - duration / durationUnit：开启后停留时长（默认 1 分钟，可切秒/分钟）
 * - shownAt：本次开启的时间戳（用于自动隐藏倒计时）
 */
export type NextGameDurationUnit = 'seconds' | 'minutes';

export interface NextGameState {
  matchId: string | null;
  visible: boolean;
  duration: number;
  durationUnit: NextGameDurationUnit;
  shownAt: number | null;
  mtime: number | null;
}

/** 推流页面3 / 后台/悬浮窗共用的下一局比赛完整载荷 */
export interface NextGamePayload {
  state: NextGameState;
  match: MatchRecord | null;
  avatars: AvatarCollectionState;
}

export interface SnapshotPayload {
  panels: [PanelState, PanelState];
  page4: Page4State;
  scoreboard: ScoreboardState;
  avatars: AvatarCollectionState;
  matches: MatchStoreState;
  stage: StageConfig;
  page6: Page6State;
  nextgame: NextGamePayload;
}

export interface QuickFillMatch {
  slot: number;
  input: string;
  matched: boolean;
  matchType: string | null;
  sprite: SpriteRecord | null;
  candidates: SpriteRecord[];
}

export interface QuickFillPreview {
  matches: QuickFillMatch[];
  acceptedCount: number;
  matchedCount: number;
  ignoredCount: number;
  unmatched: string[];
}

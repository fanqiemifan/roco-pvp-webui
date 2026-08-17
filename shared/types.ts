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
  nameFontSize: number;
  scoreFontSize: number;
  mtime: number | null;
}

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
 * - standby: 等待页
 * - blank: 黑场（不加载任何画面）
 */
export type StagePageKey =
  | 'page1-overlay'
  | 'page2'
  | 'page3'
  | 'page5'
  | 'standby'
  | 'blank';

export type StageTransitionType = 'none' | 'blinds' | 'zoom';

export interface StageConfig {
  page: StagePageKey;
  transition: StageTransitionType;
  /** 推流页面5：选手过滤（空字符串 = 全部选手） */
  page5Player: string;
  /** 推流页面5：赛事标签过滤（空字符串 = 全部标签） */
  page5Tag: string;
  mtime: number | null;
}

export interface SnapshotPayload {
  panels: [PanelState, PanelState];
  page4: Page4State;
  scoreboard: ScoreboardState;
  avatars: AvatarCollectionState;
  matches: MatchStoreState;
  stage: StageConfig;
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

export interface SpriteRecord {
  id: string;
  filename: string;
  displayName: string;
  name: string;
  chineseName: string;
  path: string;
  aliases: string[];
  number: number | null;
  variant: number;
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

export interface ScoreboardState {
  leftName: string;
  leftScore: string;
  rightName: string;
  rightScore: string;
  bestOf: number;
  scoreboardEnabled: boolean;
  healthBadgeEnabled: boolean;
  abilityBadgeEnabled: boolean;
  eventTitle: string;
  eventTitleEnabled: boolean;
  page2LineupDisplayMode: 'default' | 'avatar-only';
  nameFontSize: number;
  scoreFontSize: number;
  centerAreaEnabled: boolean;
  centerAreaColor: string;
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

export interface BackgroundState {
  exists: boolean;
  path?: string;
  size?: number;
  mtime?: number;
}

export interface SnapshotPayload {
  panels: [PanelState, PanelState];
  scoreboard: ScoreboardState;
  background: BackgroundState;
  matches: MatchStoreState;
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

import type { QuickFillMatch, Page4SlotState, SlotState } from '../../shared/types';

export type PanelSide = 'left' | 'right';
export type ViewKey = 'roster' | 'live' | 'page4' | 'history' | 'stats' | 'preview' | 'stage' | 'about';

export type PreviewSlotKey = 'stage' | 'page1' | 'page2' | 'page3' | 'page4' | 'page5' | 'page6' | 'page7' | 'page8' | 'page9';

export type JsonInit = RequestInit & {
  json?: unknown;
};

export type MatchFormValues = {
  leftPlayer: string;
  rightPlayer: string;
  leftRank?: string;
  rightRank?: string;
  bestOf: number;
  tags?: string[];
};

export type CreateMatchValues = MatchFormValues;

export type ScoreboardFormValues = {
  eventTitle: string;
  page2LineupDisplayMode: 'default' | 'avatar-only';
  page5Title: string;
  page6Title: string;
  page6Background: 'image' | 'video';
};

export type PanelEditorState = {
  selected: SlotState[];
  activeSlot: number;
  search: string;
  quickFillInput: string;
  quickFillMatches: QuickFillMatch[];
  autoSaveEnabled: boolean;
  dirty: boolean;
  saving: boolean;
};

export type Page4PanelEditorState = {
  selected: Page4SlotState[];
  activeSlot: number;
  search: string;
  quickFillInput: string;
  quickFillMatches: QuickFillMatch[];
  autoSaveEnabled: boolean;
  dirty: boolean;
  saving: boolean;
};

export type SpriteFilterState = {
  selectedAttributes: string[];
  selectedForms: string[];
  selectedFinalForm: boolean;
};

export type AttributeOption = {
  code: string;
  label: string;
  iconPath: string;
};

export type PreviewConfig = {
  title: string;
  fileName: string;
  path: string;
};

export type NoticeTone = 'success' | 'info' | 'warning' | 'error';

export type NoticeState = {
  tone: NoticeTone;
  text: string;
} | null;

export type LiveField = 'healthPercent' | 'energyValue';

export type LiveConfigPayload = {
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
    rocoFloat?: {
      toggle?: () => void;
      close?: () => void;
      reportShape?: (rect: { x: number; y: number; width: number; height: number }) => void;
      openMenu?: (payload: { side: string; slot: number; rect?: { x: number; y: number; width: number; height: number } }) => void;
      closeMenu?: () => void;
    };
    showOpenFilePicker?: (options?: unknown) => Promise<Array<{ getFile: () => Promise<File>; queryPermission?: (options?: unknown) => Promise<string>; requestPermission?: (options?: unknown) => Promise<string>; createWritable?: () => Promise<{ write: (text: string) => Promise<void>; close: () => Promise<void> }> }>>;
    showSaveFilePicker?: (options?: unknown) => Promise<{ getFile: () => Promise<File>; queryPermission?: (options?: unknown) => Promise<string>; requestPermission?: (options?: unknown) => Promise<string>; createWritable: () => Promise<{ write: (text: string) => Promise<void>; close: () => Promise<void> }> }>;
  }
}

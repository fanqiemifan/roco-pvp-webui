import fs from 'node:fs';

import { DEFAULT_BEST_OF, SUPPORTED_BEST_OF } from '../../shared/constants.js';
import type {
  GameRecord,
  MatchRecord,
  MatchSlotSnapshot,
  MatchStoreState,
} from '../../shared/types.js';
import type { AppPaths } from './path-service.js';
import { ensureRuntimeDirs } from './image-service.js';
import {
  clearPanelState,
  getPanelState,
  getScoreboardState,
  saveScoreboardState,
} from './state-service.js';

const PLAYER_NAME_MAX_LENGTH = 32;
const MAX_GAME_SLOTS = 6;
const FLOW_HISTORY_LIMIT = 50;
const DELETE_HISTORY_LIMIT = 3;

interface MatchFlowSnapshot {
  matchId: string;
  bestOf: number;
  games: GameRecord[];
  status: MatchRecord['status'];
  leftScore: number;
  rightScore: number;
  winner: MatchRecord['winner'];
  completedAt: string | null;
}

interface MatchFlowHistory {
  undoStack: MatchFlowSnapshot[];
  redoStack: MatchFlowSnapshot[];
}

interface DeletedMatchEntry {
  match: MatchRecord;
  index: number;
  flowHistory: MatchFlowHistory;
}

interface DeletedMatchBatch {
  entries: DeletedMatchEntry[];
  previousActiveMatchId: string | null;
}

interface MatchStoreFile {
  activeMatchId: string | null;
  matches: MatchRecord[];
  flowHistory: Record<string, MatchFlowHistory>;
  deletedHistory: DeletedMatchBatch[];
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizePlayerName(value: unknown): string {
  return String(value ?? '').trim().slice(0, PLAYER_NAME_MAX_LENGTH);
}

function normalizeBestOf(value: unknown): number {
  const bestOf = Number.parseInt(String(value ?? ''), 10);
  return SUPPORTED_BEST_OF.has(bestOf) ? bestOf : DEFAULT_BEST_OF;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 10);
}

function winsNeeded(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

function createEmptySlotSnapshot(index: number): MatchSlotSnapshot {
  return {
    slot: index,
    spriteId: null,
    opacityEnabled: false,
    opacity: 0.5,
    saturation: 1,
    healthEnabled: true,
    healthPercent: 100,
    energyValue: 10,
  };
}

function sanitizeLineup(lineup: unknown): string[] {
  if (!Array.isArray(lineup)) {
    return [];
  }

  return lineup
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_GAME_SLOTS);
}

function sanitizeSlotSnapshots(slots: unknown): MatchSlotSnapshot[] {
  const normalized = Array.from({ length: MAX_GAME_SLOTS }, (_, index) => createEmptySlotSnapshot(index));
  if (!Array.isArray(slots)) {
    return normalized;
  }

  slots.slice(0, MAX_GAME_SLOTS).forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const raw = item as Record<string, unknown>;
    normalized[index] = {
      slot: index,
      spriteId: typeof raw.spriteId === 'string' && raw.spriteId.trim() ? raw.spriteId.trim() : null,
      opacityEnabled: Boolean(raw.opacityEnabled),
      opacity: Number.isFinite(Number(raw.opacity)) ? Number(raw.opacity) : 0.5,
      saturation: Number.isFinite(Number(raw.saturation)) ? Number(raw.saturation) : 1,
      healthEnabled: raw.healthEnabled !== false,
      healthPercent: Number.isFinite(Number(raw.healthPercent)) ? Number(raw.healthPercent) : 100,
      energyValue: Number.isFinite(Number(raw.energyValue)) ? Number(raw.energyValue) : 10,
    };
  });

  return normalized;
}

function lineupFromSlots(slots: MatchSlotSnapshot[]): string[] {
  return slots.map((slot) => slot.spriteId).filter((spriteId): spriteId is string => Boolean(spriteId));
}

function capturePanelSnapshot(paths: AppPaths, position: 'left' | 'right'): MatchSlotSnapshot[] {
  return getPanelState(paths, position).selected.slice(0, MAX_GAME_SLOTS).map((slot, index) => ({
    slot: index,
    spriteId: slot.sprite?.id ?? null,
    opacityEnabled: Boolean(slot.opacityEnabled),
    opacity: Number(slot.opacity ?? 0.5),
    saturation: Number(slot.saturation ?? 1),
    healthEnabled: slot.healthEnabled !== false,
    healthPercent: Number(slot.healthPercent ?? 100),
    energyValue: Number(slot.energyValue ?? 10),
  }));
}

function createGameRecord(gameNumber: number, leftSlots: MatchSlotSnapshot[], rightSlots: MatchSlotSnapshot[]): GameRecord {
  return {
    gameNumber,
    leftLineup: lineupFromSlots(leftSlots),
    rightLineup: lineupFromSlots(rightSlots),
    leftSlots,
    rightSlots,
    winner: null,
    status: 'pending',
  };
}

function createEmptyGameRecord(gameNumber: number): GameRecord {
  return createGameRecord(gameNumber, sanitizeSlotSnapshots([]), sanitizeSlotSnapshots([]));
}

function summarizeSeries(games: GameRecord[], bestOf: number): {
  leftScore: number;
  rightScore: number;
  winner: MatchRecord['winner'];
} {
  const needed = winsNeeded(bestOf);
  let leftScore = 0;
  let rightScore = 0;

  for (const game of games) {
    if (game.status !== 'completed' || (game.winner !== 'left' && game.winner !== 'right')) {
      continue;
    }

    if (game.winner === 'left') {
      leftScore += 1;
    } else {
      rightScore += 1;
    }

    if (leftScore >= needed || rightScore >= needed) {
      return {
        leftScore,
        rightScore,
        winner: game.winner,
      };
    }
  }

  return {
    leftScore,
    rightScore,
    winner: null,
  };
}

function alignGamesToBestOf(games: GameRecord[], bestOf: number): GameRecord[] {
  const needed = winsNeeded(bestOf);
  const nextGames: GameRecord[] = [];
  let leftScore = 0;
  let rightScore = 0;
  let keptUnresolvedGame = false;

  for (const sourceGame of games) {
    if (leftScore >= needed || rightScore >= needed) {
      break;
    }

    const game = cloneValue(sourceGame);
    const isCompleted = game.status === 'completed' && (game.winner === 'left' || game.winner === 'right');
    if (isCompleted) {
      nextGames.push(game);
      if (game.winner === 'left') {
        leftScore += 1;
      } else {
        rightScore += 1;
      }
      continue;
    }

    if (!keptUnresolvedGame) {
      nextGames.push({
        ...game,
        winner: null,
        status: game.status === 'in_progress' ? 'in_progress' : 'pending',
      });
      keptUnresolvedGame = true;
    }
  }

  if (leftScore >= needed || rightScore >= needed) {
    return nextGames.filter((game) => game.status === 'completed' && (game.winner === 'left' || game.winner === 'right'));
  }

  if (!nextGames.length) {
    return [createEmptyGameRecord(1)];
  }

  if (!nextGames.some((game) => game.status !== 'completed')) {
    return [...nextGames, createEmptyGameRecord(nextGames.length + 1)];
  }

  return nextGames;
}

function getDatePrefix(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function resolveMatchDatePrefix(matchId: string, createdAt?: string): string {
  const idMatch = matchId.match(/^(\d{8})_\d+$/);
  if (idMatch) {
    return idMatch[1];
  }

  if (createdAt) {
    const createdDate = new Date(createdAt);
    if (!Number.isNaN(createdDate.getTime())) {
      return getDatePrefix(createdDate);
    }
  }

  return getDatePrefix();
}

function resolveMatchNumericIndex(matchId: string): number | null {
  const idMatch = matchId.match(/^\d{8}_(\d+)$/);
  if (!idMatch) {
    return null;
  }

  const nextIndex = Number.parseInt(idMatch[1], 10);
  return Number.isFinite(nextIndex) ? nextIndex : null;
}

function collectNextMatchIndexes(store: MatchStoreFile): Map<string, number> {
  const nextIndexByDate = new Map<string, number>();

  const register = (match: MatchRecord) => {
    const datePrefix = resolveMatchDatePrefix(match.id, match.createdAt);
    const numericIndex = resolveMatchNumericIndex(match.id);
    const nextValue = numericIndex ? numericIndex + 1 : 1;
    const currentValue = nextIndexByDate.get(datePrefix) ?? 1;
    nextIndexByDate.set(datePrefix, Math.max(currentValue, nextValue));
  };

  store.matches.forEach(register);
  store.deletedHistory.forEach((batch) => {
    batch.entries.forEach((entry) => register(entry.match));
  });

  return nextIndexByDate;
}

function allocateUniqueMatchId(
  usedIds: Set<string>,
  nextIndexByDate: Map<string, number>,
  preferredDatePrefix: string,
): string {
  let nextIndex = nextIndexByDate.get(preferredDatePrefix) ?? 1;
  let candidate = `${preferredDatePrefix}_${String(nextIndex).padStart(3, '0')}`;

  while (usedIds.has(candidate)) {
    nextIndex += 1;
    candidate = `${preferredDatePrefix}_${String(nextIndex).padStart(3, '0')}`;
  }

  nextIndexByDate.set(preferredDatePrefix, nextIndex + 1);
  usedIds.add(candidate);
  return candidate;
}

function computeMatchProgress(match: MatchRecord): MatchRecord {
  const games = alignGamesToBestOf(match.games, match.bestOf);
  const { leftScore, rightScore, winner } = summarizeSeries(games, match.bestOf);
  const nextStatus = winner
    ? 'completed'
    : games.some((game) => game.status === 'in_progress' || game.status === 'completed')
      ? 'in_progress'
      : 'pending';

  return {
    ...match,
    games,
    leftScore,
    rightScore,
    status: nextStatus,
    winner,
    completedAt: winner ? match.completedAt ?? new Date().toISOString() : null,
  };
}

function normalizeGameRecord(game: unknown, index: number): GameRecord {
  if (!game || typeof game !== 'object') {
    return createEmptyGameRecord(index + 1);
  }

  const raw = game as Record<string, unknown>;
  const leftSlots = sanitizeSlotSnapshots(raw.leftSlots);
  const rightSlots = sanitizeSlotSnapshots(raw.rightSlots);
  const status =
    raw.status === 'in_progress' || raw.status === 'completed'
      ? raw.status
      : 'pending';

  return {
    gameNumber: Number.isFinite(Number(raw.gameNumber)) ? Number(raw.gameNumber) : index + 1,
    leftLineup: sanitizeLineup(raw.leftLineup).length ? sanitizeLineup(raw.leftLineup) : lineupFromSlots(leftSlots),
    rightLineup: sanitizeLineup(raw.rightLineup).length ? sanitizeLineup(raw.rightLineup) : lineupFromSlots(rightSlots),
    leftSlots,
    rightSlots,
    winner: raw.winner === 'left' || raw.winner === 'right' ? raw.winner : null,
    status,
  };
}

function normalizeMatchRecord(match: unknown): MatchRecord | null {
  if (!match || typeof match !== 'object') {
    return null;
  }

  const raw = match as Record<string, unknown>;
  const bestOf = normalizeBestOf(raw.bestOf);
  const games = Array.isArray(raw.games) ? raw.games.map(normalizeGameRecord) : [];
  const normalizedGames = games.length ? games : [createEmptyGameRecord(1)];

  return computeMatchProgress({
    id: String(raw.id || '').trim(),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
    status: raw.status === 'completed' || raw.status === 'in_progress' ? raw.status : 'pending',
    leftPlayer: normalizePlayerName(raw.leftPlayer),
    rightPlayer: normalizePlayerName(raw.rightPlayer),
    bestOf,
    games: normalizedGames,
    leftScore: Number(raw.leftScore) || 0,
    rightScore: Number(raw.rightScore) || 0,
    winner: raw.winner === 'left' || raw.winner === 'right' ? raw.winner : null,
    completedAt: raw.completedAt ? String(raw.completedAt) : null,
    tags: normalizeTags(raw.tags),
  });
}

function defaultStoreFile(): MatchStoreFile {
  return {
    activeMatchId: null,
    matches: [],
    flowHistory: {},
    deletedHistory: [],
  };
}

function flowSnapshotFromMatch(match: MatchRecord): MatchFlowSnapshot {
  return {
    matchId: match.id,
    bestOf: match.bestOf,
    games: cloneValue(match.games),
    status: match.status,
    leftScore: match.leftScore,
    rightScore: match.rightScore,
    winner: match.winner,
    completedAt: match.completedAt,
  };
}

function normalizeFlowSnapshot(snapshot: unknown, fallbackMatchId: string): MatchFlowSnapshot | null {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const raw = snapshot as Record<string, unknown>;
  const matchId = typeof raw.matchId === 'string' && raw.matchId.trim()
    ? raw.matchId.trim()
    : fallbackMatchId;
  if (!matchId) {
    return null;
  }

  const bestOf = normalizeBestOf(raw.bestOf);
  const games = Array.isArray(raw.games) ? raw.games.map(normalizeGameRecord) : [];
  const normalizedGames = games.length ? games : [createEmptyGameRecord(1)];
  const normalized = computeMatchProgress({
    id: matchId,
    createdAt: '',
    updatedAt: '',
    status: raw.status === 'completed' || raw.status === 'in_progress' ? raw.status : 'pending',
    leftPlayer: '',
    rightPlayer: '',
    bestOf,
    games: normalizedGames,
    leftScore: Number(raw.leftScore) || 0,
    rightScore: Number(raw.rightScore) || 0,
    winner: raw.winner === 'left' || raw.winner === 'right' ? raw.winner : null,
    completedAt: raw.completedAt ? String(raw.completedAt) : null,
    tags: normalizeTags(raw.tags),
  });

  return {
    matchId,
    bestOf: normalized.bestOf,
    games: cloneValue(normalized.games),
    status: normalized.status,
    leftScore: normalized.leftScore,
    rightScore: normalized.rightScore,
    winner: normalized.winner,
    completedAt: normalized.completedAt,
  };
}

function normalizeFlowHistoryEntry(value: unknown, matchId: string): MatchFlowHistory {
  if (!value || typeof value !== 'object') {
    return { undoStack: [], redoStack: [] };
  }

  const raw = value as Record<string, unknown>;
  const normalizeStack = (stack: unknown): MatchFlowSnapshot[] => {
    if (!Array.isArray(stack)) {
      return [];
    }

    return stack
      .map((item) => normalizeFlowSnapshot(item, matchId))
      .filter((item): item is MatchFlowSnapshot => Boolean(item));
  };

  return {
    undoStack: normalizeStack(raw.undoStack),
    redoStack: normalizeStack(raw.redoStack),
  };
}

function normalizeFlowHistoryMap(value: unknown): Record<string, MatchFlowHistory> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const raw = value as Record<string, unknown>;
  const normalizedEntries = Object.entries(raw)
    .map(([matchId, history]) => [matchId, normalizeFlowHistoryEntry(history, matchId)] as const)
    .filter(([matchId]) => Boolean(matchId.trim()));

  return Object.fromEntries(normalizedEntries);
}

function normalizeDeletedHistory(value: unknown): DeletedMatchBatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const entries = Array.isArray(raw.entries)
        ? raw.entries.map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const source = entry as Record<string, unknown>;
          const match = normalizeMatchRecord(source.match);
          if (!match) {
            return null;
          }

          return {
            match,
            index: Number.isFinite(Number(source.index)) ? Math.max(0, Number(source.index)) : 0,
            flowHistory: normalizeFlowHistoryEntry(source.flowHistory, match.id),
          } satisfies DeletedMatchEntry;
        }).filter((entry): entry is DeletedMatchEntry => Boolean(entry))
        : [];

      if (!entries.length) {
        return null;
      }

      return {
        entries,
        previousActiveMatchId: typeof raw.previousActiveMatchId === 'string' ? raw.previousActiveMatchId : null,
      } satisfies DeletedMatchBatch;
    })
    .filter((item): item is DeletedMatchBatch => Boolean(item))
    .slice(-DELETE_HISTORY_LIMIT);
}

function normalizeStoreIdentifiers(store: MatchStoreFile): MatchStoreFile {
  const usedIds = new Set<string>();
  const nextIndexByDate = new Map<string, number>();
  const renamedIds = new Map<string, string>();

  const normalizeMatch = (match: MatchRecord): MatchRecord => {
    const preferredDatePrefix = resolveMatchDatePrefix(match.id, match.createdAt);
    const desiredId = typeof match.id === 'string' ? match.id.trim() : '';
    const canReuseDesiredId = desiredId && !usedIds.has(desiredId);
    const nextId = canReuseDesiredId
      ? (() => {
        usedIds.add(desiredId);
        const numericIndex = resolveMatchNumericIndex(desiredId);
        const nextValue = numericIndex ? numericIndex + 1 : 1;
        const currentValue = nextIndexByDate.get(preferredDatePrefix) ?? 1;
        nextIndexByDate.set(preferredDatePrefix, Math.max(currentValue, nextValue));
        return desiredId;
      })()
      : allocateUniqueMatchId(usedIds, nextIndexByDate, preferredDatePrefix);

    if (desiredId && desiredId !== nextId) {
      renamedIds.set(desiredId, nextId);
    }

    return nextId === match.id
      ? match
      : { ...match, id: nextId };
  };

  const matches = store.matches.map(normalizeMatch);
  const flowHistory: Record<string, MatchFlowHistory> = {};

  Object.entries(store.flowHistory).forEach(([matchId, history]) => {
    const nextMatchId = renamedIds.get(matchId) ?? matchId;
    flowHistory[nextMatchId] = history;
  });

  matches.forEach((match) => {
    if (!flowHistory[match.id]) {
      flowHistory[match.id] = { undoStack: [], redoStack: [] };
    }
  });

  const deletedHistory = store.deletedHistory.map((batch) => ({
    ...batch,
    previousActiveMatchId: batch.previousActiveMatchId,
    entries: batch.entries.map((entry) => {
      const normalizedMatch = normalizeMatch(entry.match);
      const nextMatchId = normalizedMatch.id;
      const entryFlowHistory = entry.flowHistory;
      flowHistory[nextMatchId] = flowHistory[nextMatchId] ?? entryFlowHistory;

      return {
        ...entry,
        match: normalizedMatch,
        flowHistory: flowHistory[nextMatchId] ?? entryFlowHistory,
      };
    }),
  })).map((batch) => ({
    ...batch,
    previousActiveMatchId: batch.previousActiveMatchId && batch.entries.some((entry) => entry.match.id === batch.previousActiveMatchId)
      ? batch.previousActiveMatchId
      : batch.previousActiveMatchId
        ? (renamedIds.get(batch.previousActiveMatchId) ?? batch.previousActiveMatchId)
        : null,
  }));

  const requestedActiveMatchId = store.activeMatchId && matches.some((match) => match.id === store.activeMatchId)
    ? store.activeMatchId
    : store.activeMatchId
      ? (renamedIds.get(store.activeMatchId) ?? store.activeMatchId)
      : null;
  const activeMatchId = requestedActiveMatchId && matches.some((match) => match.id === requestedActiveMatchId)
    ? requestedActiveMatchId
    : matches[0]?.id ?? null;

  return {
    activeMatchId,
    matches,
    flowHistory,
    deletedHistory,
  };
}

function ensureFlowHistory(store: MatchStoreFile, matchId: string): MatchFlowHistory {
  if (!store.flowHistory[matchId]) {
    store.flowHistory[matchId] = {
      undoStack: [],
      redoStack: [],
    };
  }

  return store.flowHistory[matchId];
}

function pushMatchFlowUndo(store: MatchStoreFile, match: MatchRecord): void {
  const history = ensureFlowHistory(store, match.id);
  history.undoStack.push(flowSnapshotFromMatch(match));
  if (history.undoStack.length > FLOW_HISTORY_LIMIT) {
    history.undoStack = history.undoStack.slice(history.undoStack.length - FLOW_HISTORY_LIMIT);
  }
  history.redoStack = [];
}

function applyFlowSnapshot(match: MatchRecord, snapshot: MatchFlowSnapshot): MatchRecord {
  return {
    ...match,
    bestOf: snapshot.bestOf,
    games: cloneValue(snapshot.games),
    status: snapshot.status,
    leftScore: snapshot.leftScore,
    rightScore: snapshot.rightScore,
    winner: snapshot.winner,
    completedAt: snapshot.completedAt,
    updatedAt: new Date().toISOString(),
  };
}

function toPublicStore(store: MatchStoreFile, mtime: number | null): MatchStoreState {
  const activeHistory = store.activeMatchId ? store.flowHistory[store.activeMatchId] : null;
  return {
    activeMatchId: store.activeMatchId,
    matches: store.matches,
    history: {
      canUndo: Boolean(activeHistory && activeHistory.undoStack.length > 0),
      canRedo: Boolean(activeHistory && activeHistory.redoStack.length > 0),
      canUndoDelete: store.deletedHistory.length > 0,
      deleteUndoCount: store.deletedHistory.length,
    },
    mtime,
  };
}

function readStoreFile(paths: AppPaths): { store: MatchStoreFile; mtime: number | null } {
  if (!fs.existsSync(paths.matchesFile)) {
    return { store: defaultStoreFile(), mtime: null };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(paths.matchesFile, 'utf-8')) as Record<string, unknown>;
    const stat = fs.statSync(paths.matchesFile);
    const matches = Array.isArray(raw.matches)
      ? raw.matches.map(normalizeMatchRecord).filter((match): match is MatchRecord => Boolean(match && match.id))
      : [];
    const activeMatchId = typeof raw.activeMatchId === 'string' && raw.activeMatchId.trim()
      ? raw.activeMatchId.trim()
      : null;

    const store = normalizeStoreIdentifiers({
      activeMatchId: activeMatchId && matches.some((match) => match.id === activeMatchId) ? activeMatchId : null,
      matches,
      flowHistory: normalizeFlowHistoryMap(raw.flowHistory),
      deletedHistory: normalizeDeletedHistory(raw.deletedHistory),
    });

    return {
      mtime: stat.mtimeMs,
      store,
    };
  } catch {
    return { store: defaultStoreFile(), mtime: null };
  }
}

function writeStoreFile(paths: AppPaths, store: MatchStoreFile): MatchStoreState {
  ensureRuntimeDirs(paths);
  const normalizedStore = normalizeStoreIdentifiers(store);
  fs.writeFileSync(paths.matchesFile, JSON.stringify(normalizedStore, null, 2), 'utf-8');
  return getMatchStore(paths);
}

function restorePanelFromSlots(paths: AppPaths, position: 'left' | 'right', slots: MatchSlotSnapshot[]): void {
  ensureRuntimeDirs(paths);
  const selected = sanitizeSlotSnapshots(slots).map((slot) => ({
    slot: slot.slot,
    sprite: slot.spriteId,
    opacityEnabled: slot.opacityEnabled,
    opacity: slot.opacity,
    saturation: slot.saturation,
    healthEnabled: slot.healthEnabled,
    healthPercent: slot.healthPercent,
    energyValue: slot.energyValue,
  }));

  fs.writeFileSync(
    paths.panelStatePath(position),
    JSON.stringify({ position, selected }, null, 2),
    'utf-8',
  );
}

function syncScoreboardFromMatch(paths: AppPaths, match: MatchRecord): void {
  const scoreboard = getScoreboardState(paths);
  saveScoreboardState(paths, {
    ...scoreboard,
    leftName: match.leftPlayer,
    rightName: match.rightPlayer,
    leftScore: String(match.leftScore),
    rightScore: String(match.rightScore),
    bestOf: match.bestOf,
  });
}

function clearActiveDisplayState(paths: AppPaths): void {
  clearPanelState(paths, 'left');
  clearPanelState(paths, 'right');

  const scoreboard = getScoreboardState(paths);
  saveScoreboardState(paths, {
    ...scoreboard,
    leftName: '',
    rightName: '',
    leftScore: '0',
    rightScore: '0',
    bestOf: DEFAULT_BEST_OF,
  });
}

function getCurrentGame(match: MatchRecord): GameRecord {
  return (
    match.games.find((game) => game.status === 'in_progress')
    ?? match.games.find((game) => game.status === 'pending')
    ?? match.games[match.games.length - 1]
  );
}

function assertMatchLineupEditable(match: MatchRecord, currentGame: GameRecord): void {
  if (match.status === 'completed') {
    throw new Error('当前赛事已完赛，不能编辑阵容');
  }

  if (currentGame.status === 'completed') {
    throw new Error('当前小局已结束，不能继续修改阵容');
  }
}

function syncMatchToPanelsAndScoreboard(paths: AppPaths, match: MatchRecord): void {
  const currentGame = getCurrentGame(match);

  if (match.status === 'completed' || currentGame.status !== 'in_progress') {
    restorePanelFromSlots(paths, 'left', sanitizeSlotSnapshots([]));
    restorePanelFromSlots(paths, 'right', sanitizeSlotSnapshots([]));
    syncScoreboardFromMatch(paths, match);
    return;
  }

  restorePanelFromSlots(paths, 'left', currentGame.leftSlots);
  restorePanelFromSlots(paths, 'right', currentGame.rightSlots);
  syncScoreboardFromMatch(paths, match);
}

function syncAfterStoreChange(paths: AppPaths, publicStore: MatchStoreState): void {
  const activeMatch = publicStore.matches.find((match) => match.id === publicStore.activeMatchId);
  if (activeMatch) {
    syncMatchToPanelsAndScoreboard(paths, activeMatch);
    return;
  }

  clearActiveDisplayState(paths);
}

function parseSelectedSlots(selectedSlots: unknown): MatchSlotSnapshot[] {
  if (!Array.isArray(selectedSlots)) {
    throw new Error('selected must be a list');
  }

  const nextSlots = Array.from({ length: MAX_GAME_SLOTS }, (_, index) => createEmptySlotSnapshot(index));

  selectedSlots.slice(0, MAX_GAME_SLOTS).forEach((item, index) => {
    if (item === null || item === undefined) {
      return;
    }
    if (!item || typeof item !== 'object') {
      throw new Error('slot must be an object or null');
    }

    const raw = item as Record<string, unknown>;
    const rawSprite = raw.sprite;
    const spriteId =
      rawSprite && typeof rawSprite === 'object' && typeof (rawSprite as Record<string, unknown>).id === 'string'
        ? (rawSprite as Record<string, unknown>).id
        : rawSprite;

    nextSlots[index] = {
      slot: index,
      spriteId: typeof spriteId === 'string' && spriteId.trim() ? spriteId.trim() : null,
      opacityEnabled: Boolean(raw.opacityEnabled),
      opacity: Number.isFinite(Number(raw.opacity)) ? Number(raw.opacity) : 0.5,
      saturation: Number.isFinite(Number(raw.saturation)) ? Number(raw.saturation) : 1,
      healthEnabled:
        typeof raw.healthEnabled === 'boolean'
          ? raw.healthEnabled
          : !Boolean(raw.opacityEnabled),
      healthPercent: Number.isFinite(Number(raw.healthPercent)) ? Number(raw.healthPercent) : 100,
      energyValue: Number.isFinite(Number(raw.energyValue)) ? Number(raw.energyValue) : 10,
    };
  });

  return nextSlots;
}

function parseSelectedSlot(slotIndex: number, slotData: unknown): MatchSlotSnapshot {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_GAME_SLOTS) {
    throw new Error('invalid slot index');
  }

  const nextSlots = parseSelectedSlots(
    Array.from({ length: MAX_GAME_SLOTS }, (_, index) => (index === slotIndex ? slotData : null)),
  );
  return nextSlots[slotIndex];
}


export function getMatchStore(paths: AppPaths): MatchStoreState {
  const { store, mtime } = readStoreFile(paths);
  return toPublicStore(store, mtime);
}

export function createMatch(paths: AppPaths, payload: unknown): MatchStoreState {
  if (!payload || typeof payload !== 'object') {
    throw new Error('match payload must be an object');
  }

  const raw = payload as Record<string, unknown>;
  const leftPlayer = normalizePlayerName(raw.leftPlayer);
  const rightPlayer = normalizePlayerName(raw.rightPlayer);
  const bestOf = normalizeBestOf(raw.bestOf);
  const tags = normalizeTags(raw.tags);

  if (!leftPlayer || !rightPlayer) {
    throw new Error('请输入左右两侧选手名称');
  }

  const { store } = readStoreFile(paths);
  const now = new Date().toISOString();
  const datePrefix = getDatePrefix(new Date(now));
  const nextMatchId = allocateUniqueMatchId(
    new Set<string>(),
    collectNextMatchIndexes(store),
    datePrefix,
  );
  const match: MatchRecord = {
    id: nextMatchId,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    leftPlayer,
    rightPlayer,
    bestOf,
    games: [createEmptyGameRecord(1)],
    leftScore: 0,
    rightScore: 0,
    winner: null,
    completedAt: null,
    tags,
  };

  store.activeMatchId = match.id;
  store.matches = [match, ...store.matches];
  const publicStore = writeStoreFile(paths, store);
  syncAfterStoreChange(paths, publicStore);
  return getMatchStore(paths);
}

export function updateMatch(paths: AppPaths, matchId: string, payload: unknown): MatchStoreState {
  if (!payload || typeof payload !== 'object') {
    throw new Error('match payload must be an object');
  }

  const { store } = readStoreFile(paths);
  const index = store.matches.findIndex((match) => match.id === matchId);
  if (index === -1) {
    throw new Error('比赛不存在');
  }

  const current = store.matches[index];
  const currentGame = getCurrentGame(current);
  const raw = payload as Record<string, unknown>;
  const leftPlayer = raw.leftPlayer === undefined ? current.leftPlayer : normalizePlayerName(raw.leftPlayer);
  const rightPlayer = raw.rightPlayer === undefined ? current.rightPlayer : normalizePlayerName(raw.rightPlayer);
  const nextBestOf = raw.bestOf === undefined ? current.bestOf : normalizeBestOf(raw.bestOf);

  if (!leftPlayer || !rightPlayer) {
    throw new Error('请输入左右两侧选手名称');
  }

  if (current.status === 'completed' && raw.bestOf !== undefined && nextBestOf !== current.bestOf) {
    throw new Error('已完成的比赛不能修改赛制');
  }

  if (raw.bestOf !== undefined && nextBestOf !== current.bestOf) {
    pushMatchFlowUndo(store, current);
  }
  const tags = raw.tags === undefined ? current.tags : normalizeTags(raw.tags);
  store.matches[index] = computeMatchProgress({
    ...current,
    leftPlayer,
    rightPlayer,
    bestOf: nextBestOf,
    tags,
    updatedAt: new Date().toISOString(),
  });

  const publicStore = writeStoreFile(paths, store);
  syncAfterStoreChange(paths, publicStore);
  return getMatchStore(paths);
}

export function updateMatchTags(paths: AppPaths, matchId: string, payload: unknown): MatchStoreState {
  if (!payload || typeof payload !== 'object') {
    throw new Error('tags payload must be an object');
  }

  const { store } = readStoreFile(paths);
  const index = store.matches.findIndex((match) => match.id === matchId);
  if (index === -1) {
    throw new Error('比赛不存在');
  }

  const current = store.matches[index];
  const raw = payload as Record<string, unknown>;
  const tags = normalizeTags(raw.tags);

  store.matches[index] = {
    ...current,
    tags,
    updatedAt: new Date().toISOString(),
  };

  const publicStore = writeStoreFile(paths, store);
  return getMatchStore(paths);
}

export function setActiveMatch(paths: AppPaths, matchId: string): MatchStoreState {
  const { store } = readStoreFile(paths);
  const match = store.matches.find((item) => item.id === matchId);
  if (!match) {
    throw new Error('比赛不存在');
  }

  store.activeMatchId = matchId;
  const publicStore = writeStoreFile(paths, store);
  syncAfterStoreChange(paths, publicStore);
  return getMatchStore(paths);
}

export function deleteMatch(paths: AppPaths, matchId: string): MatchStoreState {
  return deleteMatches(paths, [matchId]);
}

export function deleteMatches(paths: AppPaths, matchIds: unknown): MatchStoreState {
  if (!Array.isArray(matchIds)) {
    throw new Error('matchIds must be a list');
  }

  const { store } = readStoreFile(paths);
  const uniqueMatchIds = Array.from(new Set(
    matchIds
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean),
  ));
  if (!uniqueMatchIds.length) {
    throw new Error('请选择至少一条赛事记录');
  }

  const matchIdSet = new Set(uniqueMatchIds);
  const entries = store.matches
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => matchIdSet.has(match.id))
    .map(({ match, index }) => ({
      match: cloneValue(match),
      index,
      flowHistory: cloneValue(store.flowHistory[match.id] ?? { undoStack: [], redoStack: [] }),
    }));

  if (!entries.length) {
    throw new Error('比赛不存在');
  }

  store.deletedHistory.push({
    entries,
    previousActiveMatchId: store.activeMatchId,
  });
  if (store.deletedHistory.length > DELETE_HISTORY_LIMIT) {
    store.deletedHistory = store.deletedHistory.slice(store.deletedHistory.length - DELETE_HISTORY_LIMIT);
  }

  store.matches = store.matches.filter((match) => !matchIdSet.has(match.id));
  uniqueMatchIds.forEach((id) => {
    delete store.flowHistory[id];
  });

  if (store.activeMatchId && matchIdSet.has(store.activeMatchId)) {
    store.activeMatchId = store.matches[0]?.id ?? null;
  } else if (store.activeMatchId && !store.matches.some((match) => match.id === store.activeMatchId)) {
    store.activeMatchId = store.matches[0]?.id ?? null;
  }

  const publicStore = writeStoreFile(paths, store);
  syncAfterStoreChange(paths, publicStore);
  return getMatchStore(paths);
}

export function undoDeletedMatches(paths: AppPaths): MatchStoreState {
  const { store } = readStoreFile(paths);
  const batch = store.deletedHistory[store.deletedHistory.length - 1];
  if (!batch) {
    throw new Error('没有可撤回的删除记录');
  }

  store.deletedHistory = store.deletedHistory.slice(0, -1);
  const restoredEntries = [...batch.entries].sort((left, right) => left.index - right.index);
  const nextMatches = [...store.matches];

  restoredEntries.forEach((entry) => {
    nextMatches.splice(Math.min(entry.index, nextMatches.length), 0, cloneValue(entry.match));
    store.flowHistory[entry.match.id] = cloneValue(entry.flowHistory);
  });

  store.matches = nextMatches;
  if (
    batch.previousActiveMatchId
    && store.matches.some((match) => match.id === batch.previousActiveMatchId)
  ) {
    store.activeMatchId = batch.previousActiveMatchId;
  } else if (!store.activeMatchId) {
    store.activeMatchId = store.matches[0]?.id ?? null;
  }

  const publicStore = writeStoreFile(paths, store);
  syncAfterStoreChange(paths, publicStore);
  return getMatchStore(paths);
}

export function saveDraftPanelStateForActiveMatch(
  paths: AppPaths,
  position: 'left' | 'right',
  selectedSlots: unknown,
): MatchStoreState {
  const { store } = readStoreFile(paths);
  if (!store.activeMatchId) {
    throw new Error('当前没有活动比赛');
  }

  const index = store.matches.findIndex((match) => match.id === store.activeMatchId);
  if (index === -1) {
    throw new Error('比赛不存在');
  }

  const current = store.matches[index];
  const currentGame = getCurrentGame(current);
  assertMatchLineupEditable(current, currentGame);

  const nextSlots = parseSelectedSlots(selectedSlots);
  const nextGames = [...current.games];
  const gameIndex = nextGames.findIndex((game) => game.gameNumber === currentGame.gameNumber);
  nextGames[gameIndex] = {
    ...currentGame,
    leftSlots: position === 'left' ? nextSlots : currentGame.leftSlots,
    rightSlots: position === 'right' ? nextSlots : currentGame.rightSlots,
    leftLineup: position === 'left' ? lineupFromSlots(nextSlots) : currentGame.leftLineup,
    rightLineup: position === 'right' ? lineupFromSlots(nextSlots) : currentGame.rightLineup,
  };

  store.matches[index] = {
    ...current,
    games: nextGames,
    updatedAt: new Date().toISOString(),
  };

  return writeStoreFile(paths, store);
}

export function saveDraftPanelSlotStateForActiveMatch(
  paths: AppPaths,
  position: 'left' | 'right',
  slotIndex: number,
  slotData: unknown,
): MatchStoreState {
  const { store } = readStoreFile(paths);
  if (!store.activeMatchId) {
    throw new Error('当前没有活动比赛');
  }

  const index = store.matches.findIndex((match) => match.id === store.activeMatchId);
  if (index === -1) {
    throw new Error('比赛不存在');
  }

  const current = store.matches[index];
  const currentGame = getCurrentGame(current);
  assertMatchLineupEditable(current, currentGame);

  const nextSlot = parseSelectedSlot(slotIndex, slotData);
  const nextGames = [...current.games];
  const gameIndex = nextGames.findIndex((game) => game.gameNumber === currentGame.gameNumber);
  const leftSlots = currentGame.leftSlots.slice(0, MAX_GAME_SLOTS);
  const rightSlots = currentGame.rightSlots.slice(0, MAX_GAME_SLOTS);

  while (leftSlots.length < MAX_GAME_SLOTS) {
    leftSlots.push(createEmptySlotSnapshot(leftSlots.length));
  }
  while (rightSlots.length < MAX_GAME_SLOTS) {
    rightSlots.push(createEmptySlotSnapshot(rightSlots.length));
  }

  if (position === 'left') {
    leftSlots[slotIndex] = nextSlot;
  } else {
    rightSlots[slotIndex] = nextSlot;
  }

  nextGames[gameIndex] = {
    ...currentGame,
    leftSlots,
    rightSlots,
    leftLineup: lineupFromSlots(leftSlots),
    rightLineup: lineupFromSlots(rightSlots),
  };

  store.matches[index] = {
    ...current,
    games: nextGames,
    updatedAt: new Date().toISOString(),
  };

  return writeStoreFile(paths, store);
}

export function startCurrentGame(paths: AppPaths, matchId: string): MatchStoreState {
  const { store } = readStoreFile(paths);
  const index = store.matches.findIndex((match) => match.id === matchId);
  if (index === -1) {
    throw new Error('比赛不存在');
  }

  const current = store.matches[index];
  const pendingGameIndex = current.games.findIndex((game) => game.status === 'pending');
  if (pendingGameIndex === -1) {
    throw new Error('当前没有待开始的小局');
  }

  const pendingGame = current.games[pendingGameIndex];
  if (!pendingGame.leftLineup.length || !pendingGame.rightLineup.length) {
    throw new Error('请先为双方选择阵容，再开始本局');
  }

  pushMatchFlowUndo(store, current);
  const nextGames = [...current.games];
  nextGames[pendingGameIndex] = {
    ...pendingGame,
    status: 'in_progress',
  };

  store.matches[index] = computeMatchProgress({
    ...current,
    games: nextGames,
    updatedAt: new Date().toISOString(),
  });

  const publicStore = writeStoreFile(paths, store);
  syncAfterStoreChange(paths, publicStore);
  return getMatchStore(paths);
}

export function recordMatchWinner(
  paths: AppPaths,
  matchId: string,
  winner: 'left' | 'right',
): MatchStoreState {
  const { store } = readStoreFile(paths);
  const index = store.matches.findIndex((match) => match.id === matchId);
  if (index === -1) {
    throw new Error('比赛不存在');
  }

  const current = store.matches[index];
  if (current.status === 'completed') {
    throw new Error('该比赛已结束');
  }

  const inProgressGameIndex = current.games.findIndex((game) => game.status === 'in_progress');
  if (inProgressGameIndex === -1) {
    throw new Error('请先开始当前小局，再记录胜负');
  }

  pushMatchFlowUndo(store, current);
  const completedGame = {
    ...current.games[inProgressGameIndex],
    winner,
    status: 'completed' as const,
  };
  const nextGames = [...current.games];
  nextGames[inProgressGameIndex] = completedGame;

  let nextMatch = computeMatchProgress({
    ...current,
    games: nextGames,
    updatedAt: new Date().toISOString(),
  });

  if (nextMatch.status !== 'completed') {
    nextMatch = {
      ...nextMatch,
      games: [...nextGames, createEmptyGameRecord(nextGames.length + 1)],
      updatedAt: new Date().toISOString(),
    };
  }

  store.matches[index] = nextMatch;
  const publicStore = writeStoreFile(paths, store);
  syncAfterStoreChange(paths, publicStore);
  return getMatchStore(paths);
}

export function undoMatchAction(paths: AppPaths, matchId: string): MatchStoreState {
  const { store } = readStoreFile(paths);
  const history = ensureFlowHistory(store, matchId);
  const previousSnapshot = history.undoStack[history.undoStack.length - 1];
  if (!previousSnapshot) {
    throw new Error('没有可撤回的操作');
  }

  const matchIndex = store.matches.findIndex((match) => match.id === matchId);
  if (matchIndex === -1) {
    throw new Error('比赛不存在');
  }

  const currentMatch = store.matches[matchIndex];
  history.undoStack = history.undoStack.slice(0, -1);
  history.redoStack.push(flowSnapshotFromMatch(currentMatch));
  store.matches[matchIndex] = applyFlowSnapshot(currentMatch, previousSnapshot);

  const publicStore = writeStoreFile(paths, store);
  syncAfterStoreChange(paths, publicStore);
  return getMatchStore(paths);
}

export function redoMatchAction(paths: AppPaths, matchId: string): MatchStoreState {
  const { store } = readStoreFile(paths);
  const history = ensureFlowHistory(store, matchId);
  const nextSnapshot = history.redoStack[history.redoStack.length - 1];
  if (!nextSnapshot) {
    throw new Error('没有可取消撤回的操作');
  }

  const matchIndex = store.matches.findIndex((match) => match.id === matchId);
  if (matchIndex === -1) {
    throw new Error('比赛不存在');
  }

  const currentMatch = store.matches[matchIndex];
  history.redoStack = history.redoStack.slice(0, -1);
  history.undoStack.push(flowSnapshotFromMatch(currentMatch));
  store.matches[matchIndex] = applyFlowSnapshot(currentMatch, nextSnapshot);

  const publicStore = writeStoreFile(paths, store);
  syncAfterStoreChange(paths, publicStore);
  return getMatchStore(paths);
}

export function syncActiveMatchLineupsFromPanels(paths: AppPaths): MatchStoreState {
  const { store } = readStoreFile(paths);
  if (!store.activeMatchId) {
    return getMatchStore(paths);
  }

  const index = store.matches.findIndex((match) => match.id === store.activeMatchId);
  if (index === -1) {
    return getMatchStore(paths);
  }

  const current = store.matches[index];
  const currentGame = getCurrentGame(current);
  assertMatchLineupEditable(current, currentGame);
  if (currentGame.status !== 'pending') {
    return getMatchStore(paths);
  }

  const leftSlots = capturePanelSnapshot(paths, 'left');
  const rightSlots = capturePanelSnapshot(paths, 'right');
  const nextGames = [...current.games];
  const gameIndex = nextGames.findIndex((game) => game.gameNumber === currentGame.gameNumber);
  nextGames[gameIndex] = {
    ...currentGame,
    leftSlots,
    rightSlots,
    leftLineup: lineupFromSlots(leftSlots),
    rightLineup: lineupFromSlots(rightSlots),
  };

  store.matches[index] = {
    ...current,
    games: nextGames,
    updatedAt: new Date().toISOString(),
  };

  return writeStoreFile(paths, store);
}

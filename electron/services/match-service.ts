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
  savePanelState,
  saveScoreboardState,
} from './state-service.js';

const PLAYER_NAME_MAX_LENGTH = 32;
const MAX_GAME_SLOTS = 6;
const HISTORY_LIMIT = 50;

interface MatchStoreSnapshot {
  activeMatchId: string | null;
  matches: MatchRecord[];
}

interface MatchStoreFile extends MatchStoreSnapshot {
  undoStack: MatchStoreSnapshot[];
  redoStack: MatchStoreSnapshot[];
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

function getDatePrefix(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function computeMatchProgress(match: MatchRecord): MatchRecord {
  const leftScore = match.games.filter((game) => game.winner === 'left').length;
  const rightScore = match.games.filter((game) => game.winner === 'right').length;
  const needed = winsNeeded(match.bestOf);
  const winner = leftScore >= needed ? 'left' : rightScore >= needed ? 'right' : null;
  const nextStatus = winner
    ? 'completed'
    : match.games.some((game) => game.status === 'in_progress' || game.status === 'completed')
      ? 'in_progress'
      : 'pending';

  return {
    ...match,
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
  });
}

function defaultStoreFile(): MatchStoreFile {
  return {
    activeMatchId: null,
    matches: [],
    undoStack: [],
    redoStack: [],
  };
}

function snapshotOfStore(store: MatchStoreFile): MatchStoreSnapshot {
  return {
    activeMatchId: store.activeMatchId,
    matches: cloneValue(store.matches),
  };
}

function toPublicStore(store: MatchStoreFile, mtime: number | null): MatchStoreState {
  return {
    activeMatchId: store.activeMatchId,
    matches: store.matches,
    history: {
      canUndo: store.undoStack.length > 0,
      canRedo: store.redoStack.length > 0,
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
    const normalizeSnapshotArray = (value: unknown): MatchStoreSnapshot[] => {
      if (!Array.isArray(value)) {
        return [];
      }
      return value.map((snapshot) => {
        const source = snapshot && typeof snapshot === 'object'
          ? (snapshot as Record<string, unknown>)
          : {};
        const snapshotMatches = Array.isArray(source.matches)
          ? source.matches.map(normalizeMatchRecord).filter((match): match is MatchRecord => Boolean(match && match.id))
          : [];
        return {
          activeMatchId: typeof source.activeMatchId === 'string' ? source.activeMatchId : null,
          matches: snapshotMatches,
        };
      });
    };

    return {
      mtime: stat.mtimeMs,
      store: {
        activeMatchId: activeMatchId && matches.some((match) => match.id === activeMatchId) ? activeMatchId : null,
        matches,
        undoStack: normalizeSnapshotArray(raw.undoStack),
        redoStack: normalizeSnapshotArray(raw.redoStack),
      },
    };
  } catch {
    return { store: defaultStoreFile(), mtime: null };
  }
}

function writeStoreFile(paths: AppPaths, store: MatchStoreFile): MatchStoreState {
  ensureRuntimeDirs(paths);
  fs.writeFileSync(paths.matchesFile, JSON.stringify(store, null, 2), 'utf-8');
  return getMatchStore(paths);
}

function pushUndoState(store: MatchStoreFile): void {
  store.undoStack.push(snapshotOfStore(store));
  if (store.undoStack.length > HISTORY_LIMIT) {
    store.undoStack = store.undoStack.slice(store.undoStack.length - HISTORY_LIMIT);
  }
  store.redoStack = [];
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

function validateUndoRedoBestOf(currentMatch: MatchRecord | undefined, targetMatch: MatchRecord | undefined): void {
  if (!currentMatch || !targetMatch) {
    return;
  }

  const enteredSecondGame = currentMatch.games.length > 1;
  if (enteredSecondGame && currentMatch.bestOf !== targetMatch.bestOf) {
    throw new Error('已经进入第二个回合，不能通过撤回修改 BO 赛制');
  }
}

function pruneBestOfHistory(store: MatchStoreFile, matchId: string, bestOf: number): void {
  const keepSnapshot = (snapshot: MatchStoreSnapshot): boolean => {
    const targetMatch = snapshot.matches.find((match) => match.id === matchId);
    return !targetMatch || targetMatch.bestOf === bestOf;
  };

  store.undoStack = store.undoStack.filter(keepSnapshot);
  store.redoStack = store.redoStack.filter(keepSnapshot);
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

  if (!leftPlayer || !rightPlayer) {
    throw new Error('请输入左右两侧选手名称');
  }

  const { store } = readStoreFile(paths);
  pushUndoState(store);

  const datePrefix = getDatePrefix();
  const sameDayIds = store.matches
    .map((match) => match.id)
    .filter((id) => id.startsWith(`${datePrefix}_`))
    .map((id) => Number.parseInt(id.slice(datePrefix.length + 1), 10))
    .filter((value) => Number.isFinite(value));
  const nextIndex = sameDayIds.length ? Math.max(...sameDayIds) + 1 : 1;
  const now = new Date().toISOString();
  const match: MatchRecord = {
    id: `${datePrefix}_${String(nextIndex).padStart(3, '0')}`,
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

  const canEditBestOf = currentGame.status === 'pending' && current.games.length === 1;
  if (raw.bestOf !== undefined && nextBestOf !== current.bestOf && !canEditBestOf) {
    throw new Error('当前阶段不能修改 BO 赛制');
  }

  const maxScore = Math.max(current.leftScore, current.rightScore);
  if (winsNeeded(nextBestOf) < maxScore) {
    throw new Error('当前比分已经超过新赛制可容纳的胜局数');
  }

  pushUndoState(store);
  store.matches[index] = computeMatchProgress({
    ...current,
    leftPlayer,
    rightPlayer,
    bestOf: nextBestOf,
    updatedAt: new Date().toISOString(),
  });

  const publicStore = writeStoreFile(paths, store);
  syncAfterStoreChange(paths, publicStore);
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
  const { store } = readStoreFile(paths);
  const index = store.matches.findIndex((match) => match.id === matchId);
  if (index === -1) {
    throw new Error('比赛不存在');
  }

  pushUndoState(store);
  store.matches.splice(index, 1);

  if (store.activeMatchId === matchId) {
    store.activeMatchId = store.matches[0]?.id ?? null;
  } else if (store.activeMatchId && !store.matches.some((match) => match.id === store.activeMatchId)) {
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
  if (currentGame.status !== 'pending') {
    throw new Error('当前小局已开始，不能继续修改阵容');
  }

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

  pushUndoState(store);
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

  pushUndoState(store);
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
    if (nextMatch.games.length > 1) {
      pruneBestOfHistory(store, nextMatch.id, nextMatch.bestOf);
    }
  }

  store.matches[index] = nextMatch;
  const publicStore = writeStoreFile(paths, store);
  syncAfterStoreChange(paths, publicStore);
  return getMatchStore(paths);
}

export function undoMatchAction(paths: AppPaths): MatchStoreState {
  const { store } = readStoreFile(paths);
  const previousSnapshot = store.undoStack[store.undoStack.length - 1];
  if (!previousSnapshot) {
    throw new Error('没有可撤回的操作');
  }

  const currentMatch = store.matches.find((match) => match.id === store.activeMatchId);
  const previousMatch = previousSnapshot.matches.find((match) => match.id === previousSnapshot.activeMatchId);
  validateUndoRedoBestOf(currentMatch, previousMatch);

  const currentSnapshot = snapshotOfStore(store);
  store.undoStack = store.undoStack.slice(0, -1);
  store.redoStack.push(currentSnapshot);
  store.activeMatchId = previousSnapshot.activeMatchId;
  store.matches = cloneValue(previousSnapshot.matches);

  const publicStore = writeStoreFile(paths, store);
  syncAfterStoreChange(paths, publicStore);
  return getMatchStore(paths);
}

export function redoMatchAction(paths: AppPaths): MatchStoreState {
  const { store } = readStoreFile(paths);
  const nextSnapshot = store.redoStack[store.redoStack.length - 1];
  if (!nextSnapshot) {
    throw new Error('没有可取消撤回的操作');
  }

  const currentMatch = store.matches.find((match) => match.id === store.activeMatchId);
  const nextMatch = nextSnapshot.matches.find((match) => match.id === nextSnapshot.activeMatchId);
  validateUndoRedoBestOf(currentMatch, nextMatch);

  const currentSnapshot = snapshotOfStore(store);
  store.redoStack = store.redoStack.slice(0, -1);
  store.undoStack.push(currentSnapshot);
  store.activeMatchId = nextSnapshot.activeMatchId;
  store.matches = cloneValue(nextSnapshot.matches);

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

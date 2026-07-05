import fs from 'node:fs';

import { DEFAULT_BEST_OF, SUPPORTED_BEST_OF } from '../../shared/constants.js';
import type {
  GameRecord,
  MatchRecord,
  MatchSlotSnapshot,
  MatchStoreState,
  PanelState,
  SlotState,
} from '../../shared/types.js';
import type { AppPaths } from './path-service.js';
import { ensureRuntimeDirs } from './image-service.js';
import { getPanelState, getScoreboardState, savePanelState, saveScoreboardState } from './state-service.js';

const PLAYER_NAME_MAX_LENGTH = 32;

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
    .slice(0, 6);
}

function sanitizeSlotSnapshots(slots: unknown): MatchSlotSnapshot[] {
  const normalized = Array.from({ length: 6 }, (_, index) => createEmptySlotSnapshot(index));
  if (!Array.isArray(slots)) {
    return normalized;
  }

  slots.slice(0, 6).forEach((item, index) => {
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

function buildSlotSnapshots(slots: SlotState[]): MatchSlotSnapshot[] {
  const snapshots = Array.from({ length: 6 }, (_, index) => createEmptySlotSnapshot(index));

  slots.slice(0, 6).forEach((slot, index) => {
    snapshots[index] = {
      slot: index,
      spriteId: slot.sprite?.id ?? null,
      opacityEnabled: Boolean(slot.opacityEnabled),
      opacity: Number(slot.opacity ?? 0.5),
      saturation: Number(slot.saturation ?? 1),
      healthEnabled: slot.healthEnabled !== false,
      healthPercent: Number(slot.healthPercent ?? 100),
      energyValue: Number(slot.energyValue ?? 10),
    };
  });

  return snapshots;
}

function lineupFromSlots(slots: MatchSlotSnapshot[]): string[] {
  return slots.map((slot) => slot.spriteId).filter((spriteId): spriteId is string => Boolean(spriteId));
}

function capturePanelSnapshot(panel: PanelState): MatchSlotSnapshot[] {
  return buildSlotSnapshots(panel.selected || []);
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
  const nextStatus =
    leftScore >= needed || rightScore >= needed
      ? 'completed'
      : match.games.some((game) => game.status === 'completed')
        ? 'in_progress'
        : 'pending';
  const winner = leftScore >= needed ? 'left' : rightScore >= needed ? 'right' : null;

  return {
    ...match,
    leftScore,
    rightScore,
    status: nextStatus,
    winner,
    completedAt: nextStatus === 'completed' ? match.completedAt ?? new Date().toISOString() : null,
  };
}

function normalizeGameRecord(game: unknown, index: number): GameRecord {
  if (!game || typeof game !== 'object') {
    return createGameRecord(index + 1, sanitizeSlotSnapshots([]), sanitizeSlotSnapshots([]));
  }

  const raw = game as Record<string, unknown>;
  const leftSlots = sanitizeSlotSnapshots(raw.leftSlots);
  const rightSlots = sanitizeSlotSnapshots(raw.rightSlots);

  return {
    gameNumber: Number.isFinite(Number(raw.gameNumber)) ? Number(raw.gameNumber) : index + 1,
    leftLineup: sanitizeLineup(raw.leftLineup).length ? sanitizeLineup(raw.leftLineup) : lineupFromSlots(leftSlots),
    rightLineup: sanitizeLineup(raw.rightLineup).length ? sanitizeLineup(raw.rightLineup) : lineupFromSlots(rightSlots),
    leftSlots,
    rightSlots,
    winner: raw.winner === 'left' || raw.winner === 'right' ? raw.winner : null,
    status: raw.status === 'completed' ? 'completed' : 'pending',
  };
}

function normalizeMatchRecord(match: unknown): MatchRecord | null {
  if (!match || typeof match !== 'object') {
    return null;
  }

  const raw = match as Record<string, unknown>;
  const bestOf = normalizeBestOf(raw.bestOf);
  const games = Array.isArray(raw.games) ? raw.games.map(normalizeGameRecord) : [];
  const normalizedGames = games.length
    ? games
    : [createGameRecord(1, sanitizeSlotSnapshots([]), sanitizeSlotSnapshots([]))];

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

function normalizeStoreState(raw: unknown, mtime: number | null): MatchStoreState {
  if (!raw || typeof raw !== 'object') {
    return { activeMatchId: null, matches: [], mtime };
  }

  const data = raw as Record<string, unknown>;
  const matches = Array.isArray(data.matches)
    ? data.matches.map(normalizeMatchRecord).filter((match): match is MatchRecord => Boolean(match && match.id))
    : [];
  const activeMatchId = typeof data.activeMatchId === 'string' && data.activeMatchId.trim()
    ? data.activeMatchId.trim()
    : null;

  return {
    activeMatchId: activeMatchId && matches.some((match) => match.id === activeMatchId) ? activeMatchId : null,
    matches,
    mtime,
  };
}

function writeStore(paths: AppPaths, store: MatchStoreState): MatchStoreState {
  ensureRuntimeDirs(paths);
  fs.writeFileSync(
    paths.matchesFile,
    JSON.stringify(
      {
        activeMatchId: store.activeMatchId,
        matches: store.matches,
      },
      null,
      2,
    ),
    'utf-8',
  );

  return getMatchStore(paths);
}

function restorePanelFromSlots(paths: AppPaths, position: 'left' | 'right', slots: MatchSlotSnapshot[]): void {
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

  savePanelState(paths, position, selected);
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

function getPendingGame(match: MatchRecord): GameRecord | null {
  return match.games.find((game) => game.status === 'pending') ?? null;
}

function getDisplayGame(match: MatchRecord): GameRecord {
  return getPendingGame(match) ?? match.games[match.games.length - 1];
}

function syncMatchToPanelsAndScoreboard(paths: AppPaths, match: MatchRecord): void {
  const displayGame = getDisplayGame(match);
  restorePanelFromSlots(paths, 'left', displayGame.leftSlots);
  restorePanelFromSlots(paths, 'right', displayGame.rightSlots);
  syncScoreboardFromMatch(paths, match);
}

export function getMatchStore(paths: AppPaths): MatchStoreState {
  if (!fs.existsSync(paths.matchesFile)) {
    return { activeMatchId: null, matches: [], mtime: null };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(paths.matchesFile, 'utf-8')) as unknown;
    const stat = fs.statSync(paths.matchesFile);
    return normalizeStoreState(raw, stat.mtimeMs);
  } catch {
    return { activeMatchId: null, matches: [], mtime: null };
  }
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

  const store = getMatchStore(paths);
  const datePrefix = getDatePrefix();
  const sameDayIds = store.matches
    .map((match) => match.id)
    .filter((id) => id.startsWith(`${datePrefix}_`))
    .map((id) => Number.parseInt(id.slice(datePrefix.length + 1), 10))
    .filter((value) => Number.isFinite(value));
  const nextIndex = sameDayIds.length ? Math.max(...sameDayIds) + 1 : 1;
  const now = new Date().toISOString();
  const leftSlots = capturePanelSnapshot(getPanelState(paths, 'left'));
  const rightSlots = capturePanelSnapshot(getPanelState(paths, 'right'));
  const match: MatchRecord = {
    id: `${datePrefix}_${String(nextIndex).padStart(3, '0')}`,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    leftPlayer,
    rightPlayer,
    bestOf,
    games: [createGameRecord(1, leftSlots, rightSlots)],
    leftScore: 0,
    rightScore: 0,
    winner: null,
    completedAt: null,
  };

  const nextStore = writeStore(paths, {
    activeMatchId: match.id,
    matches: [match, ...store.matches],
    mtime: store.mtime,
  });
  const activeMatch = nextStore.matches.find((item) => item.id === nextStore.activeMatchId);
  if (activeMatch) {
    syncMatchToPanelsAndScoreboard(paths, activeMatch);
  }
  return getMatchStore(paths);
}

export function updateMatch(paths: AppPaths, matchId: string, payload: unknown): MatchStoreState {
  if (!payload || typeof payload !== 'object') {
    throw new Error('match payload must be an object');
  }

  const store = getMatchStore(paths);
  const index = store.matches.findIndex((match) => match.id === matchId);
  if (index === -1) {
    throw new Error('比赛不存在');
  }

  const current = store.matches[index];
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

  const maxScore = Math.max(current.leftScore, current.rightScore);
  if (winsNeeded(nextBestOf) < maxScore) {
    throw new Error('当前比分已经超过新赛制可容纳的胜局数');
  }

  const updated = computeMatchProgress({
    ...current,
    leftPlayer,
    rightPlayer,
    bestOf: nextBestOf,
    updatedAt: new Date().toISOString(),
  });
  const nextMatches = [...store.matches];
  nextMatches[index] = updated;
  const nextStore = writeStore(paths, { ...store, matches: nextMatches });

  if (nextStore.activeMatchId === updated.id) {
    syncScoreboardFromMatch(paths, updated);
  }

  return getMatchStore(paths);
}

export function setActiveMatch(paths: AppPaths, matchId: string): MatchStoreState {
  const store = getMatchStore(paths);
  const match = store.matches.find((item) => item.id === matchId);
  if (!match) {
    throw new Error('比赛不存在');
  }

  const nextStore = writeStore(paths, { ...store, activeMatchId: matchId });
  const activeMatch = nextStore.matches.find((item) => item.id === matchId);
  if (activeMatch) {
    syncMatchToPanelsAndScoreboard(paths, activeMatch);
  }
  return getMatchStore(paths);
}

export function syncActiveMatchLineupsFromPanels(paths: AppPaths): MatchStoreState {
  const store = getMatchStore(paths);
  if (!store.activeMatchId) {
    return store;
  }

  const index = store.matches.findIndex((match) => match.id === store.activeMatchId);
  if (index === -1) {
    return store;
  }

  const current = store.matches[index];
  if (current.status === 'completed') {
    return store;
  }

  const pendingGameIndex = current.games.findIndex((game) => game.status === 'pending');
  if (pendingGameIndex === -1) {
    return store;
  }

  const leftSlots = capturePanelSnapshot(getPanelState(paths, 'left'));
  const rightSlots = capturePanelSnapshot(getPanelState(paths, 'right'));
  const nextGames = [...current.games];
  nextGames[pendingGameIndex] = {
    ...nextGames[pendingGameIndex],
    leftSlots,
    rightSlots,
    leftLineup: lineupFromSlots(leftSlots),
    rightLineup: lineupFromSlots(rightSlots),
  };

  const nextMatches = [...store.matches];
  nextMatches[index] = {
    ...current,
    games: nextGames,
    updatedAt: new Date().toISOString(),
  };

  return writeStore(paths, { ...store, matches: nextMatches });
}

export function recordMatchWinner(
  paths: AppPaths,
  matchId: string,
  winner: 'left' | 'right',
): MatchStoreState {
  const store = getMatchStore(paths);
  const index = store.matches.findIndex((match) => match.id === matchId);
  if (index === -1) {
    throw new Error('比赛不存在');
  }

  const current = store.matches[index];
  if (current.status === 'completed') {
    throw new Error('该比赛已结束');
  }

  const pendingGameIndex = current.games.findIndex((game) => game.status === 'pending');
  if (pendingGameIndex === -1) {
    throw new Error('当前没有可结算的小局');
  }

  const leftSlots = capturePanelSnapshot(getPanelState(paths, 'left'));
  const rightSlots = capturePanelSnapshot(getPanelState(paths, 'right'));
  const completedGame = {
    ...current.games[pendingGameIndex],
    leftSlots,
    rightSlots,
    leftLineup: lineupFromSlots(leftSlots),
    rightLineup: lineupFromSlots(rightSlots),
    winner,
    status: 'completed' as const,
  };
  const nextGames = [...current.games];
  nextGames[pendingGameIndex] = completedGame;

  let nextMatch = computeMatchProgress({
    ...current,
    games: nextGames,
    updatedAt: new Date().toISOString(),
  });

  if (nextMatch.status !== 'completed') {
    const nextGameNumber = nextGames.length + 1;
    nextMatch = {
      ...nextMatch,
      games: [...nextGames, createGameRecord(nextGameNumber, leftSlots, rightSlots)],
      updatedAt: new Date().toISOString(),
    };
  }

  const nextMatches = [...store.matches];
  nextMatches[index] = nextMatch;
  const nextStore = writeStore(paths, { ...store, matches: nextMatches, activeMatchId: matchId });
  const activeMatch = nextStore.matches.find((match) => match.id === matchId);
  if (activeMatch) {
    syncMatchToPanelsAndScoreboard(paths, activeMatch);
  }
  return getMatchStore(paths);
}

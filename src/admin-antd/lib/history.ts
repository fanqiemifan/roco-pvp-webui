import type { GameRecord, MatchRecord, MatchStoreState, SpriteRecord } from '../../../shared/types';
import { DEFAULT_TAGS } from '../constants';
import type { PanelSide } from '../types';
import { formatDateTime } from './format';
import { getGameResultLabel, getGameStatusLabel } from './match';
import { resolveSpriteStatsName } from './sprite';

export function buildHistoryLineupEntries(
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

export function buildHistoryBattleEntries(
  game: GameRecord,
  spriteMap: Map<string, SpriteRecord>,
): Array<{ id: string; name: string; path: string; side: PanelSide } | null> {
  return [
    ...buildHistoryLineupEntries(game, 'left', spriteMap).map((entry) => (entry ? { ...entry, side: 'left' as const } : null)),
    ...buildHistoryLineupEntries(game, 'right', spriteMap).map((entry) => (entry ? { ...entry, side: 'right' as const } : null)),
  ];
}

export function getVisibleGames(record: MatchRecord) {
  return record.games.filter((game) => (
    game.status !== 'pending'
    || game.leftLineup.length > 0
    || game.rightLineup.length > 0
  ));
}

export function buildHistoryTags(matches: MatchStoreState['matches']): string[] {
  const tagSet = new Set<string>();
  for (const tag of DEFAULT_TAGS) {
    tagSet.add(tag);
  }
  matches.forEach((match) => {
    (match.tags ?? []).forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet);
}

export function buildHistoryCsv(matches: MatchRecord[], spriteMap: Map<string, SpriteRecord>): string {
  const header = ['赛事ID', '完成时间', '左侧选手', '右侧选手', '比分', '赛制', '标签', '局数', '该局胜方', '该局状态', '左侧阵容', '右侧阵容'];
  const lines: string[][] = [];

  matches.forEach((match) => {
    const base = [
      match.id,
      match.completedAt ? formatDateTime(match.completedAt) : '',
      match.leftPlayer || '左侧',
      match.rightPlayer || '右侧',
      `${match.leftScore} : ${match.rightScore}`,
      `BO${match.bestOf}`,
      (match.tags ?? []).join('/'),
    ];
    const visibleGames = getVisibleGames(match);
    if (!visibleGames.length) {
      lines.push([...base, '', '', '', '', '']);
      return;
    }
    visibleGames.forEach((game) => {
      const leftNames = buildHistoryLineupEntries(game, 'left', spriteMap)
        .filter((entry): entry is { id: string; name: string; path: string } => Boolean(entry))
        .map((entry) => resolveSpriteStatsName(spriteMap.get(entry.id), entry.name))
        .join('/');
      const rightNames = buildHistoryLineupEntries(game, 'right', spriteMap)
        .filter((entry): entry is { id: string; name: string; path: string } => Boolean(entry))
        .map((entry) => resolveSpriteStatsName(spriteMap.get(entry.id), entry.name))
        .join('/');
      lines.push([
        ...base,
        String(game.gameNumber),
        getGameResultLabel(game),
        getGameStatusLabel(game.status),
        leftNames,
        rightNames,
      ]);
    });
  });

  return [header, ...lines].map((cells) => cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

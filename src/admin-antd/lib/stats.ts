import type { MatchStoreState, SpriteRecord } from '../../../shared/types';
import { resolveSpriteStatsName, splitSpriteAttributes } from './sprite';

export type StatsRangeKey = 'today' | '7d' | '30d' | 'all';
export type StatsMetricKey = 'pickRate' | 'gameRate';

export const STATS_RANGE_OPTIONS: Array<{ value: StatsRangeKey; label: string }> = [
  { value: 'today', label: '今日' },
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' },
  { value: 'all', label: '全部' },
];

export const STATS_METRIC_OPTIONS: Array<{ value: StatsMetricKey; label: string }> = [
  { value: 'pickRate', label: '使用率' },
  { value: 'gameRate', label: '上场率' },
];

export type StatsWindow = { sinceMs: number; untilMs: number; player: string | null; tag: string | null };

export type SpriteUsageAccumulator = {
  picks: number;
  games: number;
  wins: number;
  dailyGames: Map<string, number>;
};

export type SpriteUsageRow = {
  key: string;
  name: string;
  spritePath: string;
  attributes: string[];
  picks: number;
  games: number;
  wins: number;
  winRate: number | null;
  usageRate: number;
  usagePercent: number;
  trendDelta: number;
  dailyGames: Map<string, number>;
};

export type UsageStatsResult = {
  totalGames: number;
  totalPicks: number;
  distinctSprites: number;
  playerCount: number;
  attributeRows: Array<{ attribute: string; count: number; percent: number }>;
  dailyKeys: string[];
  rows: SpriteUsageRow[];
  spriteAcc: Map<string, SpriteUsageAccumulator>;
  spriteMeta: Map<string, { path: string; attributes: string[] }>;
};

function getStatsDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function collectUsageStats(
  matches: MatchStoreState['matches'],
  spriteMap: Map<string, SpriteRecord>,
  window: StatsWindow,
): UsageStatsResult {
  const spriteAcc = new Map<string, SpriteUsageAccumulator>();
  const spriteMeta = new Map<string, { path: string; attributes: string[] }>();
  const attributeAcc = new Map<string, number>();
  const dailySprites = new Map<string, Map<string, number>>();
  const players = new Set<string>();
  let totalGames = 0;
  let totalPicks = 0;
  let attributeTotal = 0;

  matches.forEach((match) => {
    const time = new Date(match.createdAt).getTime();
    if (Number.isNaN(time) || time < window.sinceMs || time >= window.untilMs) {
      return;
    }
    if (window.player && match.leftPlayer !== window.player && match.rightPlayer !== window.player) {
      return;
    }
    if (window.tag && !(match.tags ?? []).includes(window.tag)) {
      return;
    }
    if (match.leftPlayer) {
      players.add(match.leftPlayer);
    }
    if (match.rightPlayer) {
      players.add(match.rightPlayer);
    }

    const dateKey = getStatsDateKey(match.createdAt);

    match.games.forEach((game) => {
      const sides: Array<{ lineup: string[]; side: 'left' | 'right' }> = [
        { lineup: game.leftLineup, side: 'left' },
        { lineup: game.rightLineup, side: 'right' },
      ];
      if (!sides.some(({ lineup }) => lineup.length > 0)) {
        return;
      }

      let gameCounted = false;
      const seen = new Set<string>();
      sides.forEach(({ lineup, side }) => {
        const won = game.winner === side;
        lineup.forEach((spriteId) => {
          const sprite = spriteMap.get(spriteId);
          const name = resolveSpriteStatsName(sprite, spriteId);
          let acc = spriteAcc.get(name);
          if (!acc) {
            acc = { picks: 0, games: 0, wins: 0, dailyGames: new Map() };
            spriteAcc.set(name, acc);
          }
          if (!spriteMeta.has(name)) {
            spriteMeta.set(name, {
              path: sprite?.path ?? '',
              attributes: sprite ? splitSpriteAttributes(sprite.attribute) : [],
            });
          }

          acc.picks += 1;
          totalPicks += 1;
          if (!seen.has(name)) {
            seen.add(name);
            acc.games += 1;
            if (won) {
              acc.wins += 1;
            }
            if (dateKey) {
              acc.dailyGames.set(dateKey, (acc.dailyGames.get(dateKey) ?? 0) + 1);
              let dayMap = dailySprites.get(dateKey);
              if (!dayMap) {
                dayMap = new Map();
                dailySprites.set(dateKey, dayMap);
              }
              dayMap.set(name, (dayMap.get(name) ?? 0) + 1);
            }
          }
          (spriteMeta.get(name)?.attributes ?? []).forEach((attribute) => {
            attributeAcc.set(attribute, (attributeAcc.get(attribute) ?? 0) + 1);
            attributeTotal += 1;
          });
          gameCounted = true;
        });
      });

      if (gameCounted) {
        totalGames += 1;
      }
    });
  });

  return {
    totalGames,
    totalPicks,
    distinctSprites: spriteAcc.size,
    playerCount: players.size,
    attributeRows: Array.from(attributeAcc.entries())
      .map(([attribute, count]) => ({
        attribute,
        count,
        percent: attributeTotal > 0 ? (count / attributeTotal) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count),
    dailyKeys: Array.from(dailySprites.keys()).sort(),
    rows: [],
    spriteAcc,
    spriteMeta,
  };
}

export function buildUsageStats(
  matches: MatchStoreState['matches'],
  spriteMap: Map<string, SpriteRecord>,
  options: { range: StatsRangeKey; player: string | null; tag: string | null; metric: StatsMetricKey },
): UsageStatsResult {
  const now = Date.now();
  let sinceMs = 0;
  let spanMs = 0;
  if (options.range === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    sinceMs = start.getTime();
    spanMs = Math.max(1, now - sinceMs);
  } else if (options.range === '7d') {
    spanMs = 7 * 86400000;
    sinceMs = now - spanMs;
  } else if (options.range === '30d') {
    spanMs = 30 * 86400000;
    sinceMs = now - spanMs;
  }

  const current = collectUsageStats(matches, spriteMap, {
    sinceMs,
    untilMs: Number.MAX_SAFE_INTEGER,
    player: options.player,
    tag: options.tag,
  });

  let prevGamesByName = new Map<string, number>();
  let prevGamesTotal = 0;
  if (options.range !== 'all' && spanMs > 0) {
    const previous = collectUsageStats(matches, spriteMap, {
      sinceMs: sinceMs - spanMs,
      untilMs: sinceMs,
      player: options.player,
      tag: options.tag,
    });
    previous.spriteAcc.forEach((acc, name) => prevGamesByName.set(name, acc.games));
    prevGamesTotal = previous.totalGames;
  }

  const denominator = options.metric === 'pickRate' ? current.totalPicks || 1 : current.totalGames || 1;
  const rows: SpriteUsageRow[] = Array.from(current.spriteAcc.entries()).map(([name, acc]) => {
    const usageRate = (options.metric === 'pickRate' ? acc.picks : acc.games) / denominator;
    const trendDelta = prevGamesTotal > 0 ? acc.games - (prevGamesByName.get(name) ?? 0) : 0;
    const meta = current.spriteMeta.get(name);
    return {
      key: name,
      name,
      spritePath: meta?.path ?? '',
      attributes: meta?.attributes ?? [],
      picks: acc.picks,
      games: acc.games,
      wins: acc.wins,
      winRate: acc.games > 0 ? acc.wins / acc.games : null,
      usageRate,
      usagePercent: Math.round(usageRate * 1000) / 10,
      trendDelta,
      dailyGames: acc.dailyGames,
    };
  });

  rows.sort((a, b) => b.usageRate - a.usageRate || b.picks - a.picks || a.name.localeCompare(b.name, 'zh-CN'));

  return { ...current, rows };
}

export function buildStatsCsv(rows: SpriteUsageRow[], metric: StatsMetricKey): string {
  const header = ['排名', '精灵', '属性', metric === 'pickRate' ? '使用率(%)' : '上场率(%)', '登场只次', '登场场次', '获胜场次', '胜率(%)'];
  const lines = rows.map((row, index) => [
    String(index + 1),
    row.name,
    row.attributes.join('/'),
    row.usagePercent.toFixed(1),
    String(row.picks),
    String(row.games),
    String(row.wins),
    row.winRate === null ? '' : (row.winRate * 100).toFixed(1),
  ]);
  return [header, ...lines].map((cells) => cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

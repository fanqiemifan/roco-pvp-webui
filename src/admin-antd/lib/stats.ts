import type { MatchStoreState, SpriteRecord } from '../../../shared/types';
import { DEFAULT_TAGS } from '../constants';
import { resolveSpriteStatsName, splitSpriteAttributes } from './sprite';

export type StatsMetricKey = 'pickRate' | 'gameRate';

export const STATS_METRIC_OPTIONS: Array<{ value: StatsMetricKey; label: string }> = [
  { value: 'pickRate', label: '使用率' },
  { value: 'gameRate', label: '上场率' },
];

export type StatsWindow = { player: string | null; tag: string | null };

export type SpriteUsageAccumulator = {
  picks: number;
  games: number;
  wins: number;
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
  tagTrendDelta: number | null;
};

export type UsageStatsResult = {
  totalGames: number;
  totalPicks: number;
  distinctSprites: number;
  playerCount: number;
  attributeRows: Array<{ attribute: string; count: number; percent: number }>;
  tagOrder: string[];
  spriteTagRate: Map<string, Map<string, number>>;
  rows: SpriteUsageRow[];
  spriteAcc: Map<string, SpriteUsageAccumulator>;
  spriteMeta: Map<string, { path: string; attributes: string[] }>;
};

function orderTags(tags: string[]): string[] {
  const tagSet = new Set(tags);
  const ordered: string[] = [];
  DEFAULT_TAGS.forEach((tag) => {
    if (tagSet.has(tag)) {
      ordered.push(tag);
      tagSet.delete(tag);
    }
  });
  return [...ordered, ...Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))];
}

function collectUsageStats(
  matches: MatchStoreState['matches'],
  spriteMap: Map<string, SpriteRecord>,
  window: StatsWindow,
): UsageStatsResult {
  const spriteAcc = new Map<string, SpriteUsageAccumulator>();
  const spriteMeta = new Map<string, { path: string; attributes: string[] }>();
  const attributeAcc = new Map<string, number>();
  const players = new Set<string>();
  let totalGames = 0;
  let totalPicks = 0;
  let attributeTotal = 0;

  matches.forEach((match) => {
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

    match.games.forEach((game) => {
      const sides: Array<{ lineup: string[]; side: 'left' | 'right' }> = [
        { lineup: game.leftLineup, side: 'left' },
        { lineup: game.rightLineup, side: 'right' },
      ];
      if (!sides.some(({ lineup }) => lineup.length > 0)) {
        return;
      }

      let gameCounted = false;
      const appearances = new Map<string, { onLeft: boolean; onRight: boolean }>();
      sides.forEach(({ lineup, side }) => {
        lineup.forEach((spriteId) => {
          const sprite = spriteMap.get(spriteId);
          const name = resolveSpriteStatsName(sprite, spriteId);
          let acc = spriteAcc.get(name);
          if (!acc) {
            acc = { picks: 0, games: 0, wins: 0 };
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
          let appearance = appearances.get(name);
          if (!appearance) {
            appearance = { onLeft: false, onRight: false };
            appearances.set(name, appearance);
          }
          if (side === 'left') {
            appearance.onLeft = true;
          } else {
            appearance.onRight = true;
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
        for (const [name, appearance] of appearances) {
          const acc = spriteAcc.get(name);
          if (!acc) {
            continue;
          }
          acc.games += 1;
          if (appearance.onLeft && appearance.onRight) {
            acc.wins += 0.5;
          } else if (
            (appearance.onLeft && game.winner === 'left') ||
            (appearance.onRight && game.winner === 'right')
          ) {
            acc.wins += 1;
          }
        }
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
    tagOrder: [],
    spriteTagRate: new Map(),
    rows: [],
    spriteAcc,
    spriteMeta,
  };
}

export function buildUsageStats(
  matches: MatchStoreState['matches'],
  spriteMap: Map<string, SpriteRecord>,
  options: { player: string | null; tag: string | null; metric: StatsMetricKey },
): UsageStatsResult {
  const { player, tag, metric } = options;

  const current = collectUsageStats(matches, spriteMap, { player, tag });
  const all = collectUsageStats(matches, spriteMap, { player: null, tag: null });
  const tagOnly = collectUsageStats(matches, spriteMap, { player: null, tag });

  const rateOf = (result: UsageStatsResult, name: string): number => {
    const acc = result.spriteAcc.get(name);
    if (!acc) {
      return 0;
    }
    const denominator = metric === 'pickRate' ? result.totalPicks : result.totalGames;
    if (!denominator) {
      return 0;
    }
    return (metric === 'pickRate' ? acc.picks : acc.games) / denominator;
  };

  const tagNames = Array.from(new Set(matches.flatMap((match) => match.tags ?? [])));
  const tagOrder = orderTags(tagNames);
  const spriteTagRate = new Map<string, Map<string, number>>();
  for (const tagName of tagOrder) {
    const tagStats = collectUsageStats(matches, spriteMap, { player: null, tag: tagName });
    for (const [name, acc] of tagStats.spriteAcc) {
      const denominator = metric === 'pickRate' ? tagStats.totalPicks : tagStats.totalGames;
      const rate = denominator > 0 ? (metric === 'pickRate' ? acc.picks : acc.games) / denominator : 0;
      let rates = spriteTagRate.get(name);
      if (!rates) {
        rates = new Map();
        spriteTagRate.set(name, rates);
      }
      rates.set(tagName, rate);
    }
  }

  const denominator = metric === 'pickRate' ? current.totalPicks || 1 : current.totalGames || 1;
  const rows: SpriteUsageRow[] = Array.from(current.spriteAcc.entries()).map(([name, acc]) => {
    const usageRate = (metric === 'pickRate' ? acc.picks : acc.games) / denominator;
    const tagTrendDelta = tag ? Math.round((rateOf(tagOnly, name) - rateOf(all, name)) * 1000) / 10 : null;
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
      tagTrendDelta,
    };
  });

  rows.sort((a, b) => b.usageRate - a.usageRate || b.picks - a.picks || a.name.localeCompare(b.name, 'zh-CN'));

  return { ...current, rows, tagOrder, spriteTagRate };
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

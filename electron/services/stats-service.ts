import path from 'node:path';

import { getMatchStore } from './match-service.js';
import { spriteLookup } from './sprite-service.js';
import type { AppPaths } from './path-service.js';

export type Page5StatsRange = 'today' | '7d' | '30d' | 'all';

export type StatsRankingRow = {
  key: string;
  name: string;
  spritePath: string;
  thumbnailId: string;
  picks: number;
  games: number;
  wins: number;
  usagePercent: number;
  winRate: number | null;
};

const SUPPORTED_RANGES = new Set<Page5StatsRange>(['today', '7d', '30d', 'all']);

function normalizeRange(value: unknown): Page5StatsRange {
  return typeof value === 'string' && SUPPORTED_RANGES.has(value as Page5StatsRange)
    ? (value as Page5StatsRange)
    : 'all';
}

function getWindow(range: Page5StatsRange): { sinceMs: number; untilMs: number } {
  const now = Date.now();
  if (range === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { sinceMs: start.getTime(), untilMs: now };
  }
  if (range === '7d') return { sinceMs: now - 7 * 86400000, untilMs: now };
  if (range === '30d') return { sinceMs: now - 30 * 86400000, untilMs: now };
  return { sinceMs: 0, untilMs: Number.MAX_SAFE_INTEGER };
}

function basename(value: string): string {
  return path.basename(String(value ?? '').trim());
}

function spriteDisplayName(sprite: unknown): string {
  if (!sprite || typeof sprite !== 'object') {
    return '';
  }
  const record = sprite as Record<string, unknown>;
  return String(
    record.chineseName
    ?? record.name
    ?? record.displayName
    ?? record.cardName
    ?? record.filename
    ?? '',
  ).trim();
}

/**
 * 按时间范围 + 赛事标签计算精灵使用率/胜率排行（Top 10，按使用率降序）。
 * - 使用率 = 登场只次 ÷ 总登场只次（同名精灵同局重复携带按只次计）
 * - 胜率 = 该精灵所在一侧获胜场次 ÷ 登场场次（同局同侧重复携带只计 1 次）
 */
export function getSpriteRanking(
  paths: AppPaths,
  options: { range: string; tag: string | null },
): { range: Page5StatsRange; tag: string | null; totalPicks: number; rows: StatsRankingRow[] } {
  const lookup = spriteLookup(paths);
  const store = getMatchStore(paths);
  const range = normalizeRange(options.range);
  const window = getWindow(range);
  const tag = typeof options.tag === 'string' && options.tag.trim() ? options.tag.trim() : null;

  const acc = new Map<string, { picks: number; games: number; wins: number }>();
  let totalPicks = 0;

  const matches = store.matches.filter((match) => {
    if (tag && !(match.tags ?? []).includes(tag)) {
      return false;
    }
    const time = new Date(match.createdAt).getTime();
    return !Number.isNaN(time) && time >= window.sinceMs && time < window.untilMs;
  });

  for (const match of matches) {
    for (const game of match.games) {
      const sides: Array<{ lineup: string[]; side: 'left' | 'right' }> = [
        { lineup: game.leftLineup, side: 'left' },
        { lineup: game.rightLineup, side: 'right' },
      ];
      if (!sides.some(({ lineup }) => lineup.length > 0)) {
        continue;
      }

      for (const { lineup, side } of sides) {
        const won = game.winner === side;
        const seen = new Set<string>();
        for (const spriteId of lineup) {
          const sprite = lookup.get(basename(spriteId)) ?? null;
          const key = sprite ? sprite.id : basename(spriteId);
          let entry = acc.get(key);
          if (!entry) {
            entry = { picks: 0, games: 0, wins: 0 };
            acc.set(key, entry);
          }
          entry.picks += 1;
          totalPicks += 1;
          if (!seen.has(key)) {
            seen.add(key);
            entry.games += 1;
            if (won) {
              entry.wins += 1;
            }
          }
        }
      }
    }
  }

  const rows: StatsRankingRow[] = [];
  for (const [key, entry] of acc) {
    const sprite = lookup.get(basename(key)) ?? null;
    rows.push({
      key,
      name: sprite ? spriteDisplayName(sprite) : basename(key),
      spritePath: sprite ? sprite.path : '',
      thumbnailId: sprite ? sprite.thumbnailId : '',
      picks: entry.picks,
      games: entry.games,
      wins: entry.wins,
      usagePercent: totalPicks > 0 ? Math.round((entry.picks / totalPicks) * 1000) / 10 : 0,
      winRate: entry.games > 0 ? entry.wins / entry.games : null,
    });
  }

  rows.sort((a, b) => b.usagePercent - a.usagePercent || b.picks - a.picks);

  return { range, tag, totalPicks, rows: rows.slice(0, 10) };
}

import type { GameRecord, MatchRecord, MatchStoreState, SpriteRecord } from '../../../shared/types';
import type { NoticeTone } from '../types';

export function winsNeeded(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

export function summarizeSeriesForBestOf(match: MatchRecord, bestOf: number) {
  const needed = winsNeeded(bestOf);
  let leftScore = 0;
  let rightScore = 0;
  let completedGameCount = 0;
  let winner: MatchRecord['winner'] = null;

  for (const game of match.games) {
    if (game.status !== 'completed' || (game.winner !== 'left' && game.winner !== 'right')) {
      continue;
    }

    completedGameCount += 1;
    if (game.winner === 'left') {
      leftScore += 1;
    } else {
      rightScore += 1;
    }

    if (leftScore >= needed || rightScore >= needed) {
      winner = game.winner;
      break;
    }
  }

  return {
    leftScore,
    rightScore,
    completedGameCount,
    winner,
  };
}

export function getActiveMatch(matchStore: MatchStoreState): MatchRecord | null {
  return matchStore.matches.find((match) => match.id === matchStore.activeMatchId) ?? null;
}

export function getCurrentGame(match: MatchRecord | null) {
  if (!match) {
    return null;
  }
  return match.games.find((game) => game.status === 'in_progress')
    ?? match.games.find((game) => game.status === 'pending')
    ?? null;
}

/**
 * 待开始小局的草稿上下文：当前赛事未完赛且当前小局为 pending 时返回该局草稿槽位。
 * pending 状态下全局面板按设计为空（未开局阵容不上推流页），阵容编辑器的显示源应为赛事草稿。
 */
export function getPendingDraftContext(matchStore: MatchStoreState) {
  const match = getActiveMatch(matchStore);
  if (!match || match.status === 'completed') {
    return null;
  }
  const game = getCurrentGame(match);
  if (!game || game.status !== 'pending') {
    return null;
  }
  return {
    matchId: match.id,
    gameNumber: game.gameNumber,
    leftSlots: game.leftSlots,
    rightSlots: game.rightSlots,
  };
}

export function formatLineupSummary(lineup: string[], spriteMap: Map<string, SpriteRecord>): string {
  if (!lineup.length) {
    return '待设置';
  }
  return lineup
    .map((spriteId) => spriteMap.get(spriteId)?.displayName ?? spriteId)
    .join(' / ');
}

export function getMatchStatusColor(status: MatchRecord['status']): string {
  if (status === 'completed') {
    return 'success';
  }
  if (status === 'in_progress') {
    return 'processing';
  }
  return 'default';
}

export function getMatchStatusLabel(status: MatchRecord['status']): string {
  if (status === 'completed') {
    return '已完成';
  }
  if (status === 'in_progress') {
    return '进行中';
  }
  return '待开始';
}

export function getNoticeTagColor(tone: NoticeTone): string {
  if (tone === 'success') {
    return 'success';
  }
  if (tone === 'warning') {
    return 'warning';
  }
  if (tone === 'error') {
    return 'error';
  }
  return 'processing';
}

export function getGameStatusLabel(status: GameRecord['status']): string {
  if (status === 'completed') {
    return '已完成';
  }
  if (status === 'in_progress') {
    return '进行中';
  }
  return '待开始';
}

export function getGameResultLabel(game: GameRecord): string {
  if (game.status === 'in_progress') {
    return '进行中';
  }
  if (game.status !== 'completed' || !game.winner) {
    return '待结算';
  }
  return game.winner === 'left' ? '左侧胜' : '右侧胜';
}

export function buildProgressItems(match: MatchRecord | null) {
  if (!match) {
    return {
      current: 0,
      items: [
        { title: '创建赛事' },
        { title: '录入阵容' },
        { title: '开始对局' },
        { title: '记录结果' },
        { title: '完成系列赛' },
      ],
    };
  }

  const currentGame = getCurrentGame(match);
  const readyToStart = Boolean(
    currentGame
    && currentGame.leftLineup.length > 0
    && currentGame.rightLineup.length > 0,
  );

  let current = 1;
  if (currentGame?.status === 'in_progress') {
    current = 3;
  } else if (readyToStart) {
    current = 2;
  }
  if (match.status === 'completed') {
    current = 4;
  }

  return {
    current,
    items: [
      { title: '创建赛事' },
      { title: '录入阵容' },
      { title: '开始对局' },
      { title: '记录结果' },
      { title: '完成系列赛' },
    ],
  };
}

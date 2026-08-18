# 类型定义索引

## 精灵相关

| 类型名称 | 说明 | 文件 |
|---------|------|------|
| SpriteRecord | 精灵记录（id, name, displayName, chineseName, number, variant, filename, path, attributes, aliases, form） | shared/types.ts |
| QuickFillMatch | 快速填充匹配结果（sprite, formLabel, rank） | shared/types.ts |
| QuickFillPreview | 快速填充预览结果汇总（matches, message） | shared/types.ts |

## 面板状态

| 类型名称 | 说明 | 文件 |
|---------|------|------|
| SlotState | 单个格子状态（slotIndex, sprite, opacity, saturation, healthPercent, energyValue） | shared/types.ts |
| PanelState | 面板状态（position, count, selected, mtime） | shared/types.ts |

## 记分牌

| 类型名称 | 说明 | 文件 |
|---------|------|------|
| ScoreboardState | 记分牌状态（leftName, leftScore, rightName, rightScore, bestOf, scoreboardEnabled, eventTitle, eventTitleEnabled, page2LineupDisplayMode, nameFontSize, scoreFontSize, mtime） | shared/types.ts |

## 仅显阵容（page4）

| 类型名称 | 说明 | 文件 |
|---------|------|------|
| Page4SlotState | page4 单个格子（slotIndex, sprite, opacityEnabled, opacity, saturation, healthEnabled, healthPercent, energyValue） | shared/types.ts |
| Page4PanelState | page4 面板（position, count, selected, mtime） | shared/types.ts |
| Page4State | page4 整体状态（left, right） | shared/types.ts |

## 直播推流（stage）

| 类型名称 | 说明 | 文件 |
|---------|------|------|
| StagePageKey | 推流页面 key：page1-overlay / page2 / page3 / page5 / page6 / page7 / blank | shared/types.ts |
| StageTransitionType | 过渡效果：none / blinds / zoom | shared/types.ts |
| StageConfig | 推流载体配置（page, transition, page5Title, page5Player, page5Tag, mtime） | shared/types.ts |
| Page6State | 比赛结果页配置（matchIds 最多 8 个已结束比赛, title 副标题, mtime） | shared/types.ts |


## 比赛记录

| 类型名称 | 说明 | 文件 |
|---------|------|------|
| MatchSlotSnapshot | 比赛格子快照（slotIndex, spriteId, spritePath） | shared/types.ts |
| GameRecord | 单局比赛记录（gameNumber, status, leftLineup, rightLineup, winner） | shared/types.ts |
| MatchRecord | 完整比赛记录（id, createdAt, updatedAt, status, leftPlayer, rightPlayer, bestOf, games, leftScore, rightScore, winner, completedAt, tags） | shared/types.ts |
| MatchStoreState | 比赛存储状态（matches, activeMatchId, mtime） | shared/types.ts |

## 头像

| 类型名称 | 说明 | 文件 |
|---------|------|------|
| AvatarState | 单个头像状态（side, exists, path, size, mtime） | shared/types.ts |
| AvatarCollectionState | 左右头像集合（left, right） | shared/types.ts |

## 快照和通信

| 类型名称 | 说明 | 文件 |
|---------|------|------|
| SnapshotPayload | Socket 快照负载（panels, page4, scoreboard, avatars, matches, stage） | shared/types.ts |
| SOCKET_EVENTS | Socket 事件名称常量对象 | shared/events.ts |

## 数据统计（管理后台本地）

| 类型名称 | 说明 | 文件 |
|---------|------|------|
| SpriteUsageRow | 精灵统计行（name, usagePercent, appearancePercent, winRate, attributes, dailyGames, key 等） | src/admin-antd/lib/stats.ts |
| StatsMetricKey | 统计口径：pickRate / appearanceRate | src/admin-antd/lib/stats.ts |
| StatsRangeKey | 统计范围：today / 7d / 30d / all | src/admin-antd/lib/stats.ts |
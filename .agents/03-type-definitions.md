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
| ScoreboardState | 记分牌状态（leftName, leftScore, rightName, rightScore, bestOf, scoreboardEnabled, healthBadgeEnabled, abilityBadgeEnabled, eventTitle, eventTitleEnabled, page2LineupDisplayMode, nameFontSize, scoreFontSize, centerAreaEnabled, centerAreaColor, mtime） | shared/types.ts |

## 比赛记录

| 类型名称 | 说明 | 文件 |
|---------|------|------|
| MatchSlotSnapshot | 比赛格子快照（slotIndex, spriteId, spritePath） | shared/types.ts |
| GameRecord | 单局比赛记录（gameNumber, status, leftLineup, rightLineup, winner） | shared/types.ts |
| MatchRecord | 完整比赛记录（id, createdAt, updatedAt, status, leftPlayer, rightPlayer, bestOf, games, leftScore, rightScore, winner, completedAt, tags） | shared/types.ts |
| MatchStoreState | 比赛存储状态（matches, activeMatchId, mtime） | shared/types.ts |

## 背景和头像

| 类型名称 | 说明 | 文件 |
|---------|------|------|
| BackgroundState | 背景图状态（exists, path, size, mtime） | shared/types.ts |
| AvatarState | 单个头像状态（side, exists, path, size, mtime） | shared/types.ts |
| AvatarCollectionState | 左右头像集合（left, right） | shared/types.ts |

## 快照和通信

| 类型名称 | 说明 | 文件 |
|---------|------|------|
| SnapshotPayload | Socket 快照负载（leftPanel, rightPanel, scoreboard, background, avatars, matches） | shared/types.ts |
| SOCKET_EVENTS | Socket 事件名称常量对象 | shared/events.ts |
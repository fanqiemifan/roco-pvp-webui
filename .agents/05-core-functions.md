# 核心函数索引

## 比赛管理 (match-service.ts)

| 自然语言描述 | 函数名 | 签名 | 说明 |
|-------------|-------|------|------|
| 获取比赛列表 | getMatchStore | (paths: AppPaths) => MatchStoreState | 获取比赛存储状态 |
| 创建比赛 | createMatch | (paths: AppPaths, payload: unknown) => MatchStoreState | 创建新比赛，payload 包含 leftPlayer, rightPlayer, bestOf, tags |
| 更新比赛信息 | updateMatch | (paths: AppPaths, matchId: string, payload: unknown) => MatchStoreState | 更新比赛信息 |
| 更新比赛标签 | updateMatchTags | (paths: AppPaths, matchId: string, payload: unknown) => MatchStoreState | 更新比赛标签 |
| 选择活动比赛 | setActiveMatch | (paths: AppPaths, matchId: string) => MatchStoreState | 设置活动比赛 |
| 删除比赛 | deleteMatch | (paths: AppPaths, matchId: string) => MatchStoreState | 删除单个比赛 |
| 批量删除比赛 | deleteMatches | (paths: AppPaths, matchIds: unknown) => MatchStoreState | 批量删除比赛，matchIds 为字符串数组 |
| 撤销删除 | undoDeletedMatches | (paths: AppPaths) => MatchStoreState | 撤销最近一次批量删除 |
| 开始当前小局 | startCurrentGame | (paths: AppPaths, matchId: string) => MatchStoreState | 开始当前小局 |
| 记录比赛胜负 | recordMatchWinner | (paths: AppPaths, matchId: string, winner: 'left' | 'right') => MatchStoreState | 记录比赛胜负 |
| 撤销比赛操作 | undoMatchAction | (paths: AppPaths, matchId: string) => MatchStoreState | 撤销比赛操作 |
| 恢复比赛操作 | redoMatchAction | (paths: AppPaths, matchId: string) => MatchStoreState | 恢复比赛操作 |
| 保存比赛草稿面板 | saveDraftPanelStateForActiveMatch | (paths: AppPaths, position: 'left' | 'right', selectedSlots: unknown) => MatchStoreState | 保存活动比赛的面板草稿 |
| 保存比赛草稿格子 | saveDraftPanelSlotStateForActiveMatch | (paths: AppPaths, position: 'left' | 'right', slotIndex: number, slotData: unknown) => MatchStoreState | 保存活动比赛的单个格子草稿 |

## 面板操作 (state-service.ts)

| 自然语言描述 | 函数名 | 签名 | 说明 |
|-------------|-------|------|------|
| 获取面板状态 | getPanelState | (paths: AppPaths, position: 'left' | 'right') => PanelState | 获取面板状态 |
| 保存面板状态 | savePanelState | (paths: AppPaths, position: 'left' | 'right', selectedSlots: unknown) => PanelState | 保存面板状态 |
| 更新单个格子 | savePanelSlotState | (paths: AppPaths, position: 'left' | 'right', slotIndex: number, slotData: unknown) => PanelState | 保存单个格子状态 |
| 清空面板 | clearPanelState | (paths: AppPaths, position: 'left' | 'right') => void | 清空面板状态 |

## 记分牌 (state-service.ts)

| 自然语言描述 | 函数名 | 签名 | 说明 |
|-------------|-------|------|------|
| 获取记分牌状态 | getScoreboardState | (paths: AppPaths) => ScoreboardState | 获取记分牌状态 |
| 保存记分牌状态 | saveScoreboardState | (paths: AppPaths, payload: unknown) => ScoreboardState | 保存记分牌状态 |
| 更新赛制 | saveScoreboardBestOf | (paths: AppPaths, payload: unknown) => ScoreboardState | 更新赛制 |

## 精灵管理 (sprite-service.ts)

| 自然语言描述 | 函数名 | 签名 | 说明 |
|-------------|-------|------|------|
| 加载精灵索引 | loadSpriteIndex | (paths: AppPaths) => SpriteRecord[] | 从 JSON 加载精灵索引 |
| 获取精灵列表 | listSprites | (paths: AppPaths) => SpriteRecord[] | 获取精灵列表（优先索引，否则扫描目录） |
| 创建精灵查找表 | spriteLookup | (paths: AppPaths) => Map<string, SpriteRecord> | 创建精灵查找 Map（key: id/filename/alias） |
| 搜索精灵 | spriteMatchesKeyword | (sprite: SpriteRecord, keyword: string) => boolean | 检查精灵是否匹配关键词 |
| 快速填充阵容 | buildQuickFillPreview | (paths: AppPaths, text: string) => QuickFillPreview | 构建快速填充预览结果 |

## 图片管理 (image-service.ts)

| 自然语言描述 | 函数名 | 签名 | 说明 |
|-------------|-------|------|------|
| 获取背景状态 | getBackgroundState | (paths: AppPaths) => BackgroundState | 获取背景状态 |
| 上传背景图 | saveBackground | (paths: AppPaths, buffer: Buffer) => BackgroundState | 保存背景图 |
| 删除背景图 | deleteBackground | (paths: AppPaths) => BackgroundState | 删除背景图 |
| 获取单个头像状态 | getAvatarState | (paths: AppPaths, side: 'left' | 'right') => AvatarState | 获取单个头像状态 |
| 获取双头像状态 | getAvatarStates | (paths: AppPaths) => AvatarCollectionState | 获取双头像状态 |
| 上传头像 | saveAvatar | (paths: AppPaths, side: 'left' | 'right', buffer: Buffer, mimeType?: string) => AvatarState | 保存头像 |
| 删除头像 | deleteAvatar | (paths: AppPaths, side: 'left' | 'right') => AvatarState | 删除头像 |
| 读取头像 MIME 类型 | readAvatarMimeType | (paths: AppPaths, side: 'left' | 'right') => string | 读取头像 MIME 类型 |

## 配置管理 (config-service.ts)

| 自然语言描述 | 函数名 | 签名 | 说明 |
|-------------|-------|------|------|
| 加载运行时配置 | loadRuntimeConfig | (paths: AppPaths) => RuntimeConfig | 加载运行时配置（port） |
| 保存运行时配置 | saveRuntimeConfig | (paths: AppPaths, config: RuntimeConfig) => RuntimeConfig | 保存运行时配置 |
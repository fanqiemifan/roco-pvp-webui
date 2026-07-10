# AI 编码使用指南

## 快速定位代码

1. **搜索文件** - 根据文件名直接搜索，如 `search "match-service.ts"`
2. **搜索函数** - 根据函数名搜索，如 `search "function createMatch"` 或 `search "export function"`
3. **搜索类型** - 根据类型名搜索，如 `search "interface MatchRecord"`
4. **搜索 API 路由** - 根据路径搜索，如 `search "/api/matches"`

## 常用操作

| 任务 | 搜索关键词 | 目标文件 |
|------|-----------|---------|
| 创建比赛 | createMatch | electron/services/match-service.ts |
| 更新面板 | savePanelState | electron/services/state-service.ts |
| 搜索精灵 | listSprites | electron/services/sprite-service.ts |
| 上传背景 | saveBackground | electron/services/image-service.ts |
| 发送 Socket 事件 | socket.emit | electron/socket-server.ts |

## 类型引用

所有类型定义集中在 shared/types.ts，使用时直接引用。核心类型：
- PanelState - 面板状态
- ScoreboardState - 记分牌状态
- MatchRecord - 比赛记录
- SlotState - 格子状态
- SpriteRecord - 精灵记录

## 文件索引

| 序号 | 文件 | 内容 |
|------|------|------|
| 01 | 01-project-overview.md | 项目架构概览、文件目录索引 |
| 02 | 02-module-dependencies.md | 模块依赖/导入映射 |
| 03 | 03-type-definitions.md | TypeScript 类型定义索引 |
| 04 | 04-api-endpoints.md | API 接口索引（含自然语言描述） |
| 05 | 05-core-functions.md | 核心函数索引（含自然语言描述、函数签名） |
| 06 | 06-socket-events.md | Socket 事件索引和数据流图 |
| 07 | 07-constants.md | 关键常量索引 |
| 08 | 08-resources-routes.md | 资源路径和页面路由索引 |
| 09 | 09-frontend-components.md | 前端组件结构 |
| 10 | 10-usage-guide.md | AI 编码使用指南 |
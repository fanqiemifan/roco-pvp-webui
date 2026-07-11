# Socket 事件索引

| 自然语言描述 | 事件名称 | 方向 | 说明 | 负载结构 |
|-------------|---------|------|------|---------|
| 获取完整状态快照 | snapshot | Server → Client | 完整状态快照 | { leftPanel, rightPanel, scoreboard, background, avatars, matches } |
| 面板更新通知 | panel:update | Server → Client | 面板更新 | { panel: PanelState } |
| 记分牌更新通知 | scoreboard:update | Server → Client | 记分牌更新 | { scoreboard: ScoreboardState } |
| 背景更新通知 | background:update | Server → Client | 背景更新 | { background: BackgroundState } |
| 头像更新通知 | avatar:update | Server → Client | 头像更新 | { side, avatar, avatars } |
| 比赛记录更新通知 | matches:update | Server → Client | 比赛记录更新 | { matches: MatchStoreState } |

# 数据流图

## 配置变更流程

```
Admin UI (React)
    ↓ (HTTP POST)
socket-server.ts (API Route)
    ↓ (调用服务)
state-service.ts / image-service.ts
    ↓ (文件写入)
Runtime Cache (JSON/PNG)
    ↓ (Socket.emit)
Display Pages (overlay.js / lineup-display.js)
    ↓ (DOM 更新)
推流画面
```

## 比赛管理流程

```
Admin UI → 创建/更新比赛
    ↓
match-service.ts → 验证、计算、存储
    ↓
matches.json (运行时存储)
    ↓ (自动同步)
state-service.ts → 更新记分牌和面板
    ↓
Socket.emit → 推送更新到所有连接的展示页面
```

## 实时状态同步

```
后台操作（编辑阵容/血量）
    ↓
socket-server.ts POST /api/panels/:position
    ↓
state-service.ts savePanelState
    ↓
Runtime Cache (left.json / right.json)
    ↓
Socket.emit('panel:update')
    ↓
展示页面 overlay.js → renderPanel() → DOM 更新
```
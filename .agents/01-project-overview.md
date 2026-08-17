# 洛克王国 PVP WebUI - 项目概览

## 项目架构

```
pvp-webUI-for-roco/
├── electron/           # Electron 主进程
│   ├── services/       # 核心业务服务（纯文件型存储）
│   ├── ipc/            # IPC 通信
│   ├── main.ts         # 应用入口（窗口/托盘/服务器启动）
│   ├── server-entry.ts # 独立服务器入口（无窗口）
│   ├── socket-server.ts # HTTP + Socket.IO 服务器
│   ├── preload.ts      # 预加载脚本（暴露 rocoDesktop / rocoFloat）
│   └── float-window.ts # 桌面阵容悬浮窗 + 更换精灵菜单窗口
├── shared/             # 共享类型和常量
│   ├── types.ts        # TypeScript 类型定义
│   ├── events.ts       # Socket 事件常量
│   └── constants.ts    # 全局常量（端口、阵容/推流/过渡）
├── src/
│   ├── admin-antd/     # 管理后台（Ant Design，React）
│   │   ├── App.tsx     # 主组件（视图分发）
│   │   ├── views/      # 各视图页面
│   │   ├── components/ # 小组件
│   │   └── lib/        # 通用逻辑（请求、统计、格式化等）
│   ├── login-antd/     # 登录页面（Ant Design）
│   ├── pages/          # 原生 HTML 页面模板（推流/展示/悬浮窗）
│   ├── scripts/        # 原生 JS 展示脚本
│   ├── styles/         # 原生 CSS 样式
│   └── assets/         # UI 资源（图标、字体）
└── resources/          # 游戏资源
    ├── sprites-img/    # 精灵图片（/img/）
    ├── sprites-alt/    # 备用精灵图片（/img-2/）
    ├── Thumbnail/      # 精灵缩略图
    ├── data/           # 数据文件（sprites.json 等）
    └── ...
```

## 文件目录索引

### Electron 主进程

| 文件路径 | 说明 |
|---------|------|
| electron/main.ts | Electron 应用主入口，主/子窗口管理、托盘、服务器启动、window.open 拦截 |
| electron/server-entry.ts | 独立服务器模式入口（无 Electron 窗口） |
| electron/socket-server.ts | Express + Socket.IO 服务器，全部 REST 路由定义 |
| electron/preload.ts | 预加载脚本，暴露 rocoDesktop（文件/剪贴板）与 rocoFloat（悬浮窗 IPC） |
| electron/float-window.ts | 桌面阵容悬浮窗（float.html）与更换精灵菜单（float-menu.html） |
| electron/ipc/window-ipc.ts | IPC 通道注册（文件读写、剪贴板、对话框） |
| electron/electron-env.d.ts | 渲染进程 window 全局类型声明 |

### 服务模块

| 文件路径 | 说明 |
|---------|------|
| electron/services/match-service.ts | 比赛管理核心服务（创建、更新、胜负、撤销/恢复） |
| electron/services/state-service.ts | 面板（panels）与记分牌状态管理 |
| electron/services/sprite-service.ts | 精灵数据加载、搜索、快速填充 |
| electron/services/image-service.ts | 头像上传/删除/读取（含魔数校验） |
| electron/services/config-service.ts | 运行时配置（端口）管理 |
| electron/services/path-service.ts | 文件路径管理和路径工厂 |
| electron/services/page4-service.ts | 仅显阵容页（page4）状态管理 |
| electron/services/stage-service.ts | 直播推流载体配置管理 |
| electron/services/stats-service.ts | 精灵精灵登场/胜率排行统计（/api/stats/ranking） |

### 共享模块

| 文件路径 | 说明 |
|---------|------|
| shared/types.ts | 所有 TypeScript 类型定义 |
| shared/events.ts | Socket.IO 事件名称常量 |
| shared/constants.ts | 全局常量（端口、默认值、推流页面/过渡枚举） |

### 管理后台（src/admin-antd）

| 文件路径 | 说明 |
|---------|------|
| App.tsx | 主组件：视图分发（roster/live/history/stats/scoreboard/stage/preview/about）、工具栏 |
| views/RosterPanelEditor.tsx | 阵容编辑（左右面板、精灵搜索、快速填充） |
| views/Page4PanelEditor.tsx | 仅显阵容（page4）面板编辑 |
| views/Page4DeathPanel.tsx | page4 阵亡面板 |
| views/StatsView.tsx | 数据统计视图（使用率/胜率排行、属性分布、标签趋势） |
| components/ | Page4SlotVisual、SpritePetCard、StageThumb 等小组件 |
| lib/ | format、history、live、match、panel、preview、request、sprite、stats 通用逻辑 |
| constants.ts / types.ts | 管理后台本地常量与类型 |
| styles.css | 管理后台样式 |

### 前端脚本（src/scripts，原生 JS）

| 文件路径 | 说明 |
|---------|------|
| overlay.js | 推流页面1（Overlay 比分栏）脚本 |
| lineup-display.js | 推流页面2（全局阵容展示）脚本 |
| page3-display.js | 推流页面3（头像比分阵容）脚本 |
| page4-display.js | 仅显阵容页（page4）脚本 |
| page5-display.js | 登场/胜率排行页（page5）脚本 |
| stage-carrier.js | 推流载体页（index.html）脚本，按 stage 配置加载对应页面 |
| live-standby-demo.js | 等待页脚本 |
| float.js | 桌面阵容悬浮窗脚本 |
| float-menu.js | 更换精灵菜单脚本 |

### 页面模板（src/pages）

| 文件路径 | 说明 |
|---------|------|
| index.html | 推流载体页（加载 stage 配置对应页面） |
| roco-pvp-page1.html | 推流页面1（Overlay 比分栏） |
| roco-pvp-page2.html | 推流页面2（全局阵容展示） |
| roco-pvp-page3.html | 推流页面3（头像比分阵容） |
| roco-pvp-page4.html | 仅显阵容页 |
| roco-pvp-page5.html | 登场/胜率排行页 |
| live-standby-demo.html | 等待页 |
| float.html | 桌面阵容悬浮窗 |
| float-menu.html | 更换精灵菜单 |
| admin-antd.html | 管理后台入口（Vite 构建产物，位于 dist/） |
| login.html | 登录页入口（Vite 构建产物，位于 dist/） |

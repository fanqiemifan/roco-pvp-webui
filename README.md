# pvp-webUI-for-roco

Node.js + Electron 版本的洛克王国 PVP WebUI。

当前结构把本地服务迁移到了 `electron/`，页面资源归档到 `src/`，业务图片与数据归档到 `resources/`。

常用目录：

- `electron/`：Electron 主进程、本地 Express + Socket.IO 服务
- `src/pages`：保留原有 UI 的多页面入口
- `src/scripts` / `src/styles` / `src/assets`：前端脚本、样式、静态 UI 资源
- `resources/`：精灵图片与 JSON 数据
- `shared/`：前后端共享类型与常量

常用命令：

- `npm run build:electron`
- `npm run dev`
- `npm run package`


## 项目结构
pvp-webUI-for-roco/
├── electron/                         # 主进程 + Node 服务层（替代原 Python backend）
│   ├── main.ts                       # Electron 入口，创建窗口、启动本地 Node 服务
│   ├── preload.ts                    # 安全桥接，暴露受控桌面能力
│   ├── socket-server.ts              # Express/HTTP + Socket.IO 服务
│   ├── services/
│   │   ├── state-service.ts          # left/right/scoreboard 状态读写
│   │   ├── sprite-service.ts         # 精灵索引、搜索、快速匹配
│   │   ├── image-service.ts          # 背景图上传、删除、读取
│   │   ├── config-service.ts         # 端口/本地配置管理
│   │   └── path-service.ts           # baseDir、userData、resources 路径统一管理
│   └── ipc/
│       └── window-ipc.ts             # 文件选择、剪贴板、窗口控制等 IPC
│
├── src/                              # 渲染层（保留现有 UI，不改视觉）
│   ├── pages/
│   │   ├── admin.html                # 原 admin.html
│   │   ├── live-control.html         # 原 live-control.html
│   │   ├── index.html                # 原 index.html
│   │   └── roco-pvp.html             # 原 roco-pvp.html
│   ├── scripts/
│   │   ├── admin.ts                  # 从 admin.html 内联脚本拆出
│   │   ├── live-control-core.ts      # 原 frontend/js/live-control-core.js
│   │   ├── overlay.ts                # 原 frontend/js/script.js
│   │   └── lineup-display.ts         # 原 frontend/js/roco-pvp-display.js
│   ├── styles/
│   │   ├── style.css                 # 原 frontend/css/style.css
│   │   └── roco-pvp-display.css      # 原 frontend/css/roco-pvp-display.css
│   └── assets/
│       ├── ui/                       # back.png、back2.png、heart*.png、start-*.png
│       └── fonts/
│           └── YouSheBiaoTiHei-2.ttf
│
├── shared/                           # 前后端共享契约
│   ├── types.ts                      # PanelState / ScoreboardState / SpriteRecord
│   ├── events.ts                     # Socket 事件名常量
│   └── constants.ts                  # 默认值、bestOf、数量限制等
│
├── resources/                        # 业务资源（随程序分发）
│   ├── sprites/                      # 原 img/
│   ├── sprites-alt/                  # 原 img-2/（如仍需保留）
│   └── data/
│       ├── sprites.json              # 原 json/sprites.json
│       └── spirits_data_final.json   # 原 json/spirits_data_final.json
│
├── docs/                             # 文档归档
│   ├── README.md
│   ├── 新的设计.md
│   └── 同步部署docker命令.md
│
├── package.json                      # 唯一依赖入口
├── tsconfig.json                     # TS 配置
├── vite.config.ts                    # 多页面构建配置
├── electron-builder.yml              # 打包配置
├── .gitignore                        # 更新为 Node/Electron 项目规则
└── package-lock.json
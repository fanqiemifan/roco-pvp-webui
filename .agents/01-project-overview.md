# 洛克王国 PVP WebUI - 项目概览

## 项目架构

```
pvp-webUI-for-roco/
├── electron/           # Electron 主进程
│   ├── services/       # 核心业务服务
│   ├── ipc/            # IPC 通信
│   ├── main.ts         # 应用入口
│   ├── server-entry.ts # 独立服务器入口
│   ├── socket-server.ts # HTTP + Socket.IO 服务器
│   └── preload.ts      # 预加载脚本
├── shared/             # 共享类型和常量
│   ├── types.ts        # TypeScript 类型定义
│   ├── events.ts       # Socket 事件常量
│   └── constants.ts    # 全局常量
├── src/
│   ├── admin-antd/     # 管理后台（Ant Design）
│   ├── login-antd/     # 登录页面（Ant Design）
│   ├── pages/          # HTML 页面模板
│   ├── scripts/        # 前端展示脚本
│   ├── styles/         # 前端样式
│   └── assets/         # 静态资源
└── resources/          # 游戏资源
    ├── sprites/        # 精灵图片
    ├── data/           # 数据文件
    └── attribute/      # 属性图标
```

## 文件目录索引

### Electron 主进程

| 文件路径 | 说明 |
|---------|------|
| electron/main.ts | Electron 应用主入口，窗口管理、托盘、服务器启动 |
| electron/server-entry.ts | 独立服务器模式入口（无 Electron 窗口） |
| electron/socket-server.ts | Express + Socket.IO 服务器，API 路由定义 |
| electron/preload.ts | 预加载脚本，暴露 IPC API 给渲染进程 |
| electron/ipc/window-ipc.ts | IPC 通道注册（文件读写、剪贴板、对话框） |

### 服务模块

| 文件路径 | 说明 |
|---------|------|
| electron/services/match-service.ts | 比赛管理核心服务（创建、更新、胜负记录、撤销） |
| electron/services/state-service.ts | 面板状态和记分牌状态管理 |
| electron/services/sprite-service.ts | 精灵数据加载、搜索、快速填充 |
| electron/services/image-service.ts | 背景图和头像上传/删除/读取 |
| electron/services/config-service.ts | 运行时配置（端口）管理 |
| electron/services/path-service.ts | 文件路径管理和路径工厂 |

### 共享模块

| 文件路径 | 说明 |
|---------|------|
| shared/types.ts | 所有 TypeScript 类型定义 |
| shared/events.ts | Socket.IO 事件名称常量 |
| shared/constants.ts | 全局常量（端口、默认值等） |

### 前端组件

| 文件路径 | 说明 |
|---------|------|
| src/admin-antd/App.tsx | 管理后台主组件（阵容编辑、实时控制、历史记录） |
| src/login-antd/App.tsx | 登录页面组件 |

### 前端脚本

| 文件路径 | 说明 |
|---------|------|
| src/scripts/overlay.js | 主展示页脚本（推流页面1），双面板、记分牌、背景 |
| src/scripts/lineup-display.js | 阵容展示页脚本（推流页面2），血量条、能量值 |
| src/scripts/live-standby-demo.js | 等待页脚本 |
| src/scripts/page3-display.js | 推流页面3脚本 |

### 页面模板

| 文件路径 | 说明 |
|---------|------|
| src/pages/index.html | 推流页面1（主展示） |
| src/pages/roco-pvp.html | 推流页面2（阵容展示） |
| src/pages/roco-pvp-page3.html | 推流页面3 |
| src/pages/live-standby-demo.html | 等待页 |
| src/pages/admin-antd.html | 管理后台入口 |
| src/pages/login.html | 登录页入口 |
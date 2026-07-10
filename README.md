# pvp-webUI-for-roco

常用命令：

- `npm run build:electron`
- `npm run dev`
- `npm run package`


## 项目结构
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
# AGENTS.md（中文版）

Roco PVP WebUI — 洛克王国比赛推流控制台。Electron（Express + Socket.IO）后端 + React/AntD 管理后台。代码注释、提交信息以及 `.agents/` 里的文档均为中文。

## 常用命令（全部来自 `package.json` 的 scripts）

- `npm run build` — 构建 renderer + electron。会触发 `prebuild` → `npm run sync:sprites`，该脚本会**从网络下载精灵图片**（数据源为 `热补丁索引/spirits_index.json`）。如果只想重新生成索引、不想下载图片，运行 `node scripts/sync-spirits-assets.mjs --skip-download`。
- `npm run dev` — 构建 renderer + electron，然后启动 Electron 桌面应用。
- `npm run serve:node` — 构建 + 无头 Node 服务器（默认 `--host 127.0.0.1 --port 9988`）。Docker 使用的就是这个模式。
- `npm run package` — 构建 + electron-builder，产出 Windows NSIS 安装包到 `release/`（已被 gitignore）。
- **没有 lint、没有格式化工具、没有测试套件。** 验证手段 = `npm run build` + `npm run typecheck:frontend`。

## 两套独立的 TS 工程 — 注意差异

- Electron 侧：`tsconfig.json`（`NodeNext` ESM，输出到 `dist-electron/`）。相对导入**必须带 `.js` 后缀**（如 `../shared/events.js`）。它没有 `noEmit`，所以 Electron 侧的"类型检查"就是直接跑 `npm run build:electron`。
- 前端 React 侧：`tsconfig.frontend.json`（`Bundler` 解析，`noEmit`），用 `npm run typecheck:frontend` 检查，只覆盖 `src/admin-antd`、`src/login-antd`、`shared`。
- Vite（`vite.config.ts`）**只打包** `src/pages/admin-antd.html` 和 `src/pages/login.html` 到 `dist/`；`emptyOutDir: true` 每次构建会清空 `dist/`。
- 推流/展示页面（`src/pages/*.html`、`src/scripts/*.js`、`src/styles/*.css`）是纯原生 JS，静态伺服——**不属于 Vite 构建**。

## 两种运行模式 — 鉴权行为不同

- 桌面模式（`electron/main.ts`）：**关闭鉴权**，后台入口在 `/admin.html`。
- Node 服务器模式（`electron/server-entry.ts`，Dockerfile 也是用这个）：**开启鉴权**；默认账号密码为 `admin` / `admin123`，除非设置了 `ADMIN_USER` / `ADMIN_PASS` 环境变量。Docker compose 里显式设置了这两个变量。

## 运行时数据（生成物，已被 gitignore — 切勿提交）

- 面板/记分牌/比赛/page4/导播台/头像状态以及端口配置，都以 JSON/PNG 形式存放在某个 userData 目录下的 `runtime/cache/` 中，路径解析逻辑在 `electron/services/path-service.ts`：
  - 桌面模式：Electron `app.getPath('userData')`。
  - Node/Docker 模式：`<项目根目录>/LuokePVPWebui`（可用 `ROCO_DATA_DIR` 覆盖）。
- `resources/data/sprites.json` 和 `resources/sprites-img/` 由 `scripts/sync-spirits-assets.mjs` 从 `热补丁索引/spirits_index.json` **生成**（精灵图片目录就是 `/img/` 伺服的那个目录）。精灵数据变化后要重新跑脚本（或改 `spirits_index.json` 再重新生成）；**不要手改 `sprites.json`**。

## 架构

- `electron/socket-server.ts` 是唯一的 Express + Socket.IO 服务器，持有所有 REST 路由和 socket 事件推送。`electron/services/*` 是纯文件型存储；所有新路径都要加在 `path-service.ts` 里。
- `electron/float-window.ts` 负责桌面阵容悬浮窗（`float.html`，透明置顶 587×56）与更换精灵菜单（`float-menu.html`，240×240），通过 `preload.ts` 暴露的 `window.rocoFloat` IPC 通道驱动。
- `shared/types.ts`（全部类型）、`shared/events.ts`（socket 事件）、`shared/constants.ts`（默认值：端口 9988、BO7、6 个格子、推流页面/过渡枚举）——electron 和 React 代码都会引用。
- 管理后台：`src/admin-antd/App.tsx`（阵容/实时控制/历史/数据统计/显示设置/直播推流/页面预览/关于），按视图拆在 `src/admin-antd/views/`，通用逻辑在 `lib/`、小组件在 `components/`。登录页：`src/login-antd/App.tsx`。
- 推流/展示页面是纯原生 JS（`src/pages/*.html` + `src/scripts/*.js` + `src/styles/*.css`），其中 `page4`/`page5` 分别是仅显阵容页与使用率/胜率排行页，`float`/`float-menu` 是桌面悬浮窗页面。
- 排位排名（page3 比分栏图标）：在「开一局」创建弹窗或赛事面板「当前比赛」表单输入（仅数字、可选），随对局存入 `matches.json` 并由 `syncScoreboardFromMatch` 同步到记分牌；「直播推流」面板的 `page3RankVisible` 开关控制推流页显隐（开启但未输入排名只显示图标，超过 10000 显示 `10000+`）。
- 详细索引（类型、API 路由、函数、socket 事件、常量、文件地图）在 `.agents/01..10-*.md` —— 遇到问题先查它们；行为有变化时要同步更新这些文档。

## 注意事项

- `.npmrc` 固定了 npmmirror 源和 Electron 二进制镜像；离线时安装可能失败。`sync:sprites` 需要联网，除非加 `--skip-download`。
- 头像上传会校验文件魔数（`image-service.ts` 中的存储型 XSS 防护）——改动时务必保留该检查。
- `antd` skill 可用（`.agents/skills/antd`），Ant Design 相关开发建议加载。
- 提交风格：conventional commits，中文 scope/正文，例如 `feat(stage): ...`、`fix(security): ...`。

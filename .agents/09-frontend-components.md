# 前端组件结构

## admin-antd（管理后台，React + Ant Design）

### 目录结构
- App.tsx — 主组件：Layout（Header/Sider/Content）、视图分发、工具栏按钮（阵容悬浮窗/打开预览/复制链接/刷新）
- views/ — 各视图独立页面
- components/ — 可复用小组件
- lib/ — 无状态纯函数（请求、统计、格式化等）
- constants.ts / types.ts — 本地常量与类型

### 视图页面（ViewKey）
- roster - 阵容编辑（RosterPanelEditor：左右面板编辑、精灵搜索、快速填充）
- live - 实时控制（比赛开始、胜负记录、撤销/恢复）
- history - 比赛历史（列表、删除、批量删除、撤销删除）
- stats - 数据统计（StatsView：使用率/上场率排行、属性分布、Top 3 趋势；1920px 断点布局）
- scoreboard - 显示设置（选手名、分数、赛制、显示选项、page4 面板编辑）
- stage - 直播推流（推流页面切换、过渡效果、page5 标题/口径）
- preview - 页面预览
- about - 关于项目（更新日志）

### 核心状态（App.tsx）
- leftPanel / rightPanel、page4、scoreboard、matches、avatars、stage
- stats 相关：statsRange / statsMetric / statsPlayer / statsTag / statsSearch
- socket - Socket.IO 连接实例

### 核心逻辑（lib/）
- request.ts - fetch 封装
- sprite.ts - 精灵数据辅助
- match.ts - 比赛操作辅助
- panel.ts - 面板状态辅助
- live.ts - 实时控制辅助
- history.ts - 历史记录辅助
- stats.ts - 统计聚合（buildUsageStats、buildStatsCsv）
- format.ts - 格式化工具
- preview.ts - 预览链接构建

### 小组件（components/）
- Page4SlotVisual.tsx - page4 格子视觉
- SpritePetCard.tsx - 精灵卡片
- StageThumb.tsx - 推流页面缩略图

## login-antd（登录页面）

### 核心功能
- 用户登录表单（用户名、密码）
- 登录状态检查
- 登录成功后跳转至管理后台

## 推流/展示页面（原生 JS，src/pages + src/scripts + src/styles）

- index.html + stage-carrier.js — 推流载体，按 stage 配置用 iframe 加载对应页面
- roco-pvp-page1.html + overlay.js — Overlay 比分栏
- roco-pvp-page2.html + lineup-display.js — 全局阵容展示
- roco-pvp-page3.html + page3-display.js — 头像比分阵容
- roco-pvp-page4.html + page4-display.js — 仅显阵容
- roco-pvp-page5.html + page5-display.js — 使用率/胜率排行
- live-standby-demo.html + live-standby-demo.js — 等待页
- float.html + float.js — 桌面阵容悬浮窗（透明置顶小窗）
- float-menu.html + float-menu.js — 更换精灵菜单（形态选择 / 全新精灵选择器）

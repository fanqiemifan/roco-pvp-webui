# 前端组件结构

## admin-antd（管理后台，React + Ant Design）

### 目录结构
- App.tsx — 主组件：Layout（Header/Sider/Content）、视图分发、工具栏按钮（阵容悬浮窗/打开预览/复制链接/刷新）、「开一局」创建赛事弹窗（选手名/排位排名/头像/赛制/标签）
- views/ — 各视图独立页面
- components/ — 可复用小组件
- lib/ — 无状态纯函数（请求、统计、格式化等）
- constants.ts / types.ts — 本地常量与类型

### 视图页面（ViewKey）
- roster - 阵容编辑（RosterPanelEditor：左右面板编辑、精灵搜索、快速填充；顶部「当前比赛」表单含左右选手名+排位排名（仅数字，PATCH 保存比赛信息时一并提交））
- live - 实时控制（比赛开始、胜负记录、撤销/恢复）
- history - 比赛历史（列表、删除、批量删除、撤销删除；「推送」勾选列推送比赛结果到页面6、「预告」勾选列推送比赛预告到页面8，可勾选待开始与进行中的对局）
- stats - 数据统计（StatsView：使用率/上场率排行、属性分布、标签趋势；1920px 断点布局）
- stage - 直播推流（推流页面切换、过渡效果、page5 口径；「推流页面3精灵图片」卡片；「推流页面3排位图标」开关控制页面3比分栏排位图标显隐；底部「显示设置」卡片：页面2赛事标题/阵容展示、推流页5标题、比分字号）
- preview - 页面预览（推流页面1-8 切换；页面8 附带「比赛预告设置」：主标题/副标题、壁纸图片1/图片2/自定义上传）
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
- roco-pvp-page3.html + page3-display.js — 头像比分阵容；比分栏中央两侧排位排名图标（stage.page3RankVisible 控制显隐，开启但未输入排名时仅显示图标；排名超过 10000 显示 10000+，txt 位置按位数查表）
- roco-pvp-page4.html + page4-display.js — 仅显阵容
- roco-pvp-page5.html + page5-display.js — 登场/胜率排行
- roco-pvp-page7.html + page7-display.js — 等待页（公开免鉴权，history-panel 展示后台推送的比赛结果）
- roco-pvp-page8.html + page8-display.js — 比赛预告页（公开免鉴权，复用 page6 布局；选手对局信息卡 w860×h88 两列网格，最多 12 场，展示 vs + 双方选手名 + 排位排名图标（复用 page3 rank 样式）；不进直播推流可选画面，仅在页面预览展示）
- float.html + float.js — 桌面阵容悬浮窗（透明置顶小窗）
- float-menu.html + float-menu.js — 更换精灵菜单（形态选择 / 全新精灵选择器）

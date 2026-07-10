# 前端组件结构

## admin-antd/App.tsx（管理后台）

### 主布局结构：
- Layout (Ant Design) - 整体布局
  - Header - 顶部导航栏
  - Sider - 侧边菜单
  - Content - 主内容区域

### 视图页面（ViewKey）：
- roster - 阵容编辑页（左右面板编辑、精灵搜索、快速填充）
- live - 实时控制面板（比赛开始、胜负记录、撤销/恢复）
- history - 历史记录页（比赛列表、删除、撤销删除）
- scoreboard - 记分牌配置页（选手名、分数、赛制、显示选项）
- background - 背景和头像配置页（上传、删除）
- preview - 预览页（四个推流页面预览）
- about - 关于页

### 核心状态：
- leftPanel / rightPanel - 双面板状态
- scoreboard - 记分牌状态
- matches - 比赛存储状态
- background / avatars - 图片状态
- leftEditor / rightEditor - 编辑器状态（selected, activeSlot, search 等）
- socket - Socket.IO 连接实例

### 核心函数：
- fetchSnapshot() - 获取初始快照
- savePanel(side, slots) - 保存面板状态
- saveSlot(side, slotIndex, data) - 保存单个格子
- searchSprites(query) - 搜索精灵
- quickFill(side, text) - 快速填充阵容
- createMatch(values) - 创建比赛
- updateMatch(matchId, values) - 更新比赛
- recordWinner(matchId, winner) - 记录胜负
- undoMatch(matchId) / redoMatch(matchId) - 撤销/恢复
- uploadBackground(file) - 上传背景
- uploadAvatar(side, file) - 上传头像

## login-antd/App.tsx（登录页面）

### 核心功能：
- 用户登录表单（用户名、密码）
- 登录状态检查
- 登录成功后跳转至管理后台

### 核心函数：
- handleLogin(values) - 处理登录请求
- checkAuth() - 检查登录状态
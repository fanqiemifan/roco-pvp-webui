# API 接口索引

## 认证接口

| 自然语言描述 | 方法 | 路径 | 说明 | 文件 |
|-------------|------|------|------|------|
| 用户登录 | POST | /api/auth/login | 登录 | electron/socket-server.ts |
| 用户登出 | POST | /api/auth/logout | 登出 | electron/socket-server.ts |
| 检查登录状态 | GET | /api/auth/check | 检查登录状态 | electron/socket-server.ts |

## 面板接口

| 自然语言描述 | 方法 | 路径 | 说明 | 文件 |
|-------------|------|------|------|------|
| 保存面板 | POST | /api/panels/:position | 保存整个面板状态（position: left/right） | electron/socket-server.ts |
| 更新格子 | PATCH | /api/panels/:position/slots/:slot | 更新单个格子 | electron/socket-server.ts |
| 清空面板 | DELETE | /api/panels/:position | 清空面板 | electron/socket-server.ts |

## 记分牌接口

| 自然语言描述 | 方法 | 路径 | 说明 | 文件 |
|-------------|------|------|------|------|
| 获取记分牌 | GET | /api/scoreboard | 获取记分牌状态 | electron/socket-server.ts |
| 保存记分牌 | POST | /api/scoreboard | 保存记分牌状态 | electron/socket-server.ts |
| 更新赛制 | POST | /api/scoreboard/best-of | 更新赛制 | electron/socket-server.ts |

## 比赛接口

| 自然语言描述 | 方法 | 路径 | 说明 | 文件 |
|-------------|------|------|------|------|
| 获取所有比赛 | GET | /api/matches | 获取所有比赛记录 | electron/socket-server.ts |
| 创建比赛 | POST | /api/matches | 创建新比赛 | electron/socket-server.ts |
| 更新比赛 | PATCH | /api/matches/:matchId | 更新比赛信息 | electron/socket-server.ts |
| 更新比赛标签 | PATCH | /api/matches/:matchId/tags | 更新比赛标签 | electron/socket-server.ts |
| 删除比赛 | DELETE | /api/matches/:matchId | 删除单个比赛 | electron/socket-server.ts |
| 选择活动比赛 | POST | /api/matches/:matchId/select | 选择活动比赛 | electron/socket-server.ts |
| 开始小局 | POST | /api/matches/:matchId/start | 开始当前小局 | electron/socket-server.ts |
| 记录胜负 | POST | /api/matches/:matchId/winner | 记录本局胜负 | electron/socket-server.ts |
| 撤销操作 | POST | /api/matches/:matchId/undo | 撤销操作 | electron/socket-server.ts |
| 恢复操作 | POST | /api/matches/:matchId/redo | 恢复操作 | electron/socket-server.ts |
| 批量删除比赛 | POST | /api/matches/history/delete | 批量删除比赛 | electron/socket-server.ts |
| 撤销删除 | POST | /api/matches/history/undo-delete | 撤销删除 | electron/socket-server.ts |

## 精灵接口

| 自然语言描述 | 方法 | 路径 | 说明 | 文件 |
|-------------|------|------|------|------|
| 搜索精灵 | GET | /api/sprites | 搜索精灵（支持 q 参数） | electron/socket-server.ts |
| 快速填充 | POST | /api/quick-fill | 快速填充阵容 | electron/socket-server.ts |

## 图片接口

| 自然语言描述 | 方法 | 路径 | 说明 | 文件 |
|-------------|------|------|------|------|
| 获取双面板 | GET | /api/images | 获取双面板状态 | electron/socket-server.ts |
| 获取背景 | GET | /api/background | 获取背景状态 | electron/socket-server.ts |
| 上传背景 | POST | /api/upload/background | 上传背景图 | electron/socket-server.ts |
| 删除背景 | DELETE | /api/delete/background | 删除背景图 | electron/socket-server.ts |
| 获取头像 | GET | /api/avatars | 获取左右头像状态 | electron/socket-server.ts |
| 上传头像 | POST | /api/upload/avatar/:side | 上传头像（side: left/right） | electron/socket-server.ts |
| 删除头像 | DELETE | /api/delete/avatar/:side | 删除头像 | electron/socket-server.ts |

## 配置接口

| 自然语言描述 | 方法 | 路径 | 说明 | 文件 |
|-------------|------|------|------|------|
| 获取运行时配置 | GET | /api/runtime-config | 获取运行时配置 | electron/socket-server.ts |
| 保存运行时配置 | POST | /api/runtime-config | 保存运行时配置 | electron/socket-server.ts |
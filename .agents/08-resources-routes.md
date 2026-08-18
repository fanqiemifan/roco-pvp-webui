# 资源路径索引

| 路径前缀 | 映射目录 | 说明 |
|---------|---------|------|
| /scripts/ | src/scripts/ | 前端脚本 |
| /styles/ | src/styles/ | 前端样式 |
| /assets/ | src/assets/ | UI 资源 |
| /antd-assets/ | dist/antd-assets/ | Vite 构建产物（管理后台） |
| /resources/ | resources/ | 游戏资源（精灵、数据、缩略图） |
| /img/ | resources/sprites-img/ | 精灵图片 |
| /img-2/ | resources/sprites-alt/ | 备用精灵图片 |
| /json/ | resources/data/ | JSON 数据文件 |
| /runtime/ | runtime/cache/ | 运行时生成的图片（头像、截图） |
| /image/ | src/assets/ui/ | UI 图片 |
| /font/ | src/assets/fonts/ | 字体文件 |
| /api/avatar/left-avatar.png | runtime/cache/ | 左侧头像图片 |
| /api/avatar/right-avatar.png | runtime/cache/ | 右侧头像图片 |

# 页面路由索引

| 路径 | 页面 | 说明 |
|------|------|------|
| / | index.html | 推流载体页（按 stage 配置加载对应页面） |
| /roco-pvp-page1.html | roco-pvp-page1.html | 推流页面1（Overlay 比分栏） |
| /roco-pvp-page2.html | roco-pvp-page2.html | 推流页面2（全局阵容展示） |
| /roco-pvp-page3.html | roco-pvp-page3.html | 推流页面3（头像比分阵容） |
| /page4.html、/roco-pvp-page4.html | roco-pvp-page4.html | 仅显阵容页 |
| /roco-pvp-page5.html | roco-pvp-page5.html | 登场/胜率排行页 |
| /roco-pvp-page6.html | roco-pvp-page6.html | 比赛结果展示页 |
| /live-standby-demo.html | live-standby-demo.html | 等待页 |
| /float.html | float.html | 桌面阵容悬浮窗 |
| /float-menu.html | float-menu.html | 更换精灵菜单 |
| /login.html | login-antd 构建产物 | 登录页面 |
| /admin.html、/admin-antd.html | admin-antd 构建产物 | 管理后台 |

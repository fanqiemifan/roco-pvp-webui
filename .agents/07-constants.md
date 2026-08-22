# 关键常量索引

| 常量名 | 值 | 说明 | 文件 |
|-------|-----|------|------|
| DEFAULT_PORT | 9988 | 默认服务端口 | shared/constants.ts |
| APP_DATA_DIRNAME | LuokePVPWebui | Node/Docker 模式数据目录名 | shared/constants.ts |
| MAX_SELECTION_COUNT | 6 | 最大选择数量（阵容格子数） | shared/constants.ts |
| DEFAULT_OPACITY | 0.5 | 默认透明度 | shared/constants.ts |
| DEFAULT_SATURATION | 1.0 | 默认饱和度 | shared/constants.ts |
| DEFAULT_HEALTH_PERCENT | 100 | 默认血量百分比 | shared/constants.ts |
| DEFAULT_ENERGY_VALUE | 10 | 默认能量值 | shared/constants.ts |
| DEFAULT_BEST_OF | 7 | 默认赛制（BO7） | shared/constants.ts |
| DEFAULT_EVENT_TITLE | '' | 默认赛事标题 | shared/constants.ts |
| SUPPORTED_IMAGE_EXTENSIONS | {.png,.jpg,.jpeg,.webp} | 支持的头像图片扩展名 | shared/constants.ts |
| SUPPORTED_BEST_OF | {1,3,5,7} | 支持的赛制 | shared/constants.ts |
| DEFAULT_STAGE_PAGE | page3 | 默认推流页面 | shared/constants.ts |
| SUPPORTED_STAGE_PAGES | {page1-overlay,page2,page3,page5,page6,page7,blank} | 支持的推流页面 | shared/constants.ts |
| DEFAULT_STAGE_TRANSITION | blinds | 默认切换过渡 | shared/constants.ts |
| SUPPORTED_STAGE_TRANSITIONS | {none,blinds,zoom} | 支持的过渡效果 | shared/constants.ts |
| DEFAULT_PAGE3_SPRITE_SOURCE | sprite | 页面3精灵图片来源默认值（sprite / thumbnail） | shared/constants.ts |
| SUPPORTED_PAGE3_SPRITE_SOURCES | {sprite,thumbnail} | 页面3精灵图片来源枚举 | shared/constants.ts |
| DEFAULT_PAGE3_RANK_VISIBLE | false | 页面3排位排名图标默认隐藏 | shared/constants.ts |
| RANK_TEXT_MAX_LENGTH | 10 | 排位排名存储最大位数（超过 10000 显示 10000+） | shared/constants.ts |

## 悬浮窗尺寸（electron/float-window.ts）

| 常量名 | 值 | 说明 |
|-------|-----|------|
| FLOAT_WINDOW_WIDTH / HEIGHT | 587 × 56 | 阵容悬浮窗尺寸（与 lineup 内容等大） |
| DEFAULT_FLOAT_SHAPE | {x:0,y:0,w:587,h:56} | 悬浮窗兜底可点击区域 |
| FLOAT_MENU_WIDTH / HEIGHT | 240 × 240 | 更换精灵菜单尺寸 |
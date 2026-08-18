export const DEFAULT_PORT = 9988;
export const APP_DATA_DIRNAME = 'LuokePVPWebui';
export const MAX_SELECTION_COUNT = 6;
export const DEFAULT_OPACITY = 0.5;
export const DEFAULT_SATURATION = 1.0;
export const DEFAULT_HEALTH_PERCENT = 100;
export const DEFAULT_ENERGY_VALUE = 10;
export const DEFAULT_BEST_OF = 7;
export const DEFAULT_EVENT_TITLE = '';
export const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
export const SUPPORTED_BEST_OF = new Set([1, 3, 5, 7]);

/**
 * 直播推流画面 key 集合：决定推流载体页（index.html）加载哪个推流页面。
 * - page1-overlay: 推流页面1（Overlay 比分栏布局）
 * - page2: 推流页面2（全局阵容展示）
 * - page3: 推流页面3（头像比分阵容）
 * - page5: 推流页面5（使用率/胜率排行）
 * - page6: 推流页面6（比赛结果）
 * - page7: 推流页面7（等待页）
 * - blank: 黑场
 */
export const DEFAULT_STAGE_PAGE = 'page3';
export const SUPPORTED_STAGE_PAGES = new Set([
  'page1-overlay',
  'page2',
  'page3',
  'page5',
  'page6',
  'page7',
  'blank',
]);

/**
 * 直播推流切换过渡效果集合：
 * - none: 无过渡（直接切换）
 * - blinds: 双向百叶窗
 * - zoom: 缩放冲击（中心脉冲）
 */
export const DEFAULT_STAGE_TRANSITION = 'blinds';
export const SUPPORTED_STAGE_TRANSITIONS = new Set(['none', 'blinds', 'zoom']);

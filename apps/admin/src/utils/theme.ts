/**
 * 主题与 html class 工具
 * 职责：切换灰色/色弱 class；写入自有 CSS 变量与 Ant Design token 桥接变量；
 * 导出与 theme.scss 一致的色常量供 JS（ConfigProvider / ECharts / stroke）使用
 * @note @apps/admin 全局强制暗黑；改色只改本文件 + theme.scss
 */

/**
 * 与 theme.scss --font-family 保持一致（ConfigProvider token 需 JS 字符串）
 * Ant Design 5 系统栈 + 中文兜底
 */
export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

/** 默认品牌主色（与 theme.scss $--color-primary、uni --wot-primary-6 对齐） */
export const COLOR_PRIMARY = "#1688ff";

/** 与 theme.scss --color-text* 一致（全局暗黑 ConfigProvider token） */
export const COLOR_TEXT = "rgba(255, 255, 255, 0.92)";
export const COLOR_TEXT_SECONDARY = "rgba(255, 255, 255, 0.78)";
export const COLOR_TEXT_TERTIARY = "rgba(255, 255, 255, 0.58)";
export const COLOR_TEXT_DISABLED = "rgba(255, 255, 255, 0.35)";
export const COLOR_TEXT_PLACEHOLDER = "rgba(255, 255, 255, 0.4)";
export const COLOR_TEXT_LIGHT_SOLID = "#ffffff";

/** 暗黑容器底（与 theme.scss --bg-color / --fill-color 对齐） */
export const COLOR_BG_CONTAINER = "#1f1f1f";
export const COLOR_BG_LAYOUT = "#141414";
export const COLOR_BG_ELEVATED = "#1f1f1f";

/** 功能色（JS 侧：进度条 / 波形图等无法写 CSS var 的场景） */
export const COLOR_SUCCESS = "#52c41a";
export const COLOR_SUCCESS_HOVER = "#95de64";
export const COLOR_WARNING = "#faad14";
export const COLOR_WARNING_HOVER = "#ffd666";
export const COLOR_ERROR = "#ff4d4f";
export const COLOR_ERROR_HOVER = "#ff7875";
export const COLOR_INFO = COLOR_PRIMARY;
export const COLOR_NEUTRAL = "#8c8c8c";
export const COLOR_NEUTRAL_BG = "#bfbfbf";
export const COLOR_NEUTRAL_BORDER = "#d9d9d9";

/** 暗黑填充阶（ECharts 等需具体字符串时用） */
export const COLOR_FILL_TERTIARY = "rgba(255, 255, 255, 0.08)";
export const COLOR_FILL_QUATERNARY = "rgba(255, 255, 255, 0.1)";

/** 设置/移除目标元素 class */
export function toggleClass(flag: boolean, clsName: string, target?: HTMLElement) {
  const targetEl = target || document.body;
  let { className } = targetEl;
  className = className.replace(clsName, "").trim();
  targetEl.className = flag ? `${className} ${clsName}` : className;
}

/**
 * 处理主题色：自有变量供 Uno/布局；--ant-color-primary 供少量覆盖；
 * ConfigProvider 的 token 由 App.vue 响应式注入
 * @note 暗黑下 primary-bg 用主色半透明，不用冲淡到近白
 */
export function handleThemeStyle(theme: string) {
  document.documentElement.style.setProperty("--color-primary", theme);
  const rgb = hexToRgb(theme);
  document.documentElement.style.setProperty(
    "--color-primary-bg",
    `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.18)`
  );
  document.documentElement.style.setProperty("--ant-color-primary", theme);
  document.documentElement.style.setProperty("--color-info", theme);
  document.documentElement.style.setProperty("--ant-color-info", theme);
  // VXE 主色：暗黑主题下由 vxeThemeBridge 读 --color-primary；此处同步运行时改主色
  document.documentElement.style.setProperty("--vxe-ui-font-primary-color", theme);
}

export function hexToRgb(str: string) {
  str = str.replace("#", "");
  const hexs = str.match(/../g) as string[];
  const rgb = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    rgb[i] = parseInt(hexs[i], 16);
  }
  return rgb;
}

export function rgbToHex(r: number, g: number, b: number) {
  const hexs = [r.toString(16), g.toString(16), b.toString(16)];
  for (let i = 0; i < 3; i++) {
    if (hexs[i].length == 1) {
      hexs[i] = `0${hexs[i]}`;
    }
  }
  return `#${hexs.join("")}`;
}

export function getLightColor(color: string, level: number) {
  const rgb = hexToRgb(color);
  for (let i = 0; i < 3; i++) {
    rgb[i] = Math.floor((255 - rgb[i]) * level + rgb[i]);
  }
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

export function getDarkColor(color: string, level: number) {
  const rgb = hexToRgb(color);
  for (let i = 0; i < 3; i++) {
    rgb[i] = Math.floor(rgb[i] * (1 - level));
  }
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

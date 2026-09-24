/**
 * 主题与 html class 工具
 * 职责：导出与 Ant Design `darkAlgorithm` 一致的色常量；切换主色时用算法刷新 CSS 变量
 * @note 中性色/功能色取 dark map；ConfigProvider 只传 seed（见 App.vue），勿再手调偏亮 alpha
 */

import { theme as antdTheme } from "ant-design-vue";

/**
 * 与 theme.scss --font-family 保持一致（ConfigProvider token 需 JS 字符串）
 */
export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

/** 品牌主色 seed（settings / ConfigProvider）；暗黑界面实际用色为算法派生 map */
export const COLOR_PRIMARY = "#1688ff";

/** darkAlgorithm 中性字色（seed textBase=#fff） */
export const COLOR_TEXT = "rgba(255, 255, 255, 0.85)";
export const COLOR_TEXT_SECONDARY = "rgba(255, 255, 255, 0.65)";
export const COLOR_TEXT_TERTIARY = "rgba(255, 255, 255, 0.45)";
export const COLOR_TEXT_DISABLED = "rgba(255, 255, 255, 0.25)";
export const COLOR_TEXT_PLACEHOLDER = COLOR_TEXT_DISABLED;
export const COLOR_TEXT_LIGHT_SOLID = "#ffffff";

/** darkAlgorithm 面色 */
export const COLOR_BG_CONTAINER = "#141414";
export const COLOR_BG_LAYOUT = "#000000";
export const COLOR_BG_ELEVATED = "#1f1f1f";
export const COLOR_BORDER = "#424242";

/**
 * 功能色：darkAlgorithm map（seed=#1688ff 时的静态默认）
 * HOVER 取 *TextHover（偏亮），供 ECharts 渐变第二色，勿用算法里偏暗的 *Hover
 */
export const COLOR_SUCCESS = "#49aa19";
export const COLOR_SUCCESS_HOVER = "#6abe39";
export const COLOR_WARNING = "#d89614";
export const COLOR_WARNING_HOVER = "#e8b339";
export const COLOR_ERROR = "#dc4446";
export const COLOR_ERROR_HOVER = "#e86e6b";
export const COLOR_INFO = "#1677dc";
export const COLOR_NEUTRAL = "#8c8c8c";
export const COLOR_NEUTRAL_BG = "#bfbfbf";
export const COLOR_NEUTRAL_BORDER = "#d9d9d9";

export const COLOR_FILL_TERTIARY = "rgba(255, 255, 255, 0.08)";
export const COLOR_FILL_QUATERNARY = "rgba(255, 255, 255, 0.04)";

/** 设置/移除目标元素 class */
export function toggleClass(flag: boolean, clsName: string, target?: HTMLElement) {
  const targetEl = target || document.body;
  let { className } = targetEl;
  className = className.replace(clsName, "").trim();
  targetEl.className = flag ? `${className} ${clsName}` : className;
}

/**
 * 用 darkAlgorithm 把 seed 主色展开为 map，写入 CSS 变量（与 antd 组件同盘）
 * @param primarySeed 品牌主色 seed（settings.theme）
 */
export function handleThemeStyle(primarySeed: string) {
  const seed = primarySeed?.trim() || COLOR_PRIMARY;
  const map = antdTheme.darkAlgorithm({
    ...antdTheme.defaultSeed,
    colorPrimary: seed,
    colorInfo: seed
  });

  const root = document.documentElement;
  const set = (name: string, value: string | undefined) => {
    if (value) root.style.setProperty(name, value);
  };

  set("--color-primary", map.colorPrimary);
  set("--color-primary-bg", map.colorPrimaryBg);
  set("--color-info", map.colorInfo);
  set("--color-info-bg", map.colorPrimaryBg);
  set("--color-success", map.colorSuccess);
  set("--color-success-bg", map.colorSuccessBg);
  set("--color-success-text", map.colorSuccessTextHover);
  set("--color-warning", map.colorWarning);
  set("--color-warning-bg", map.colorWarningBg);
  set("--color-warning-text", map.colorWarningTextHover);
  set("--color-error", map.colorError);
  set("--color-error-bg", map.colorErrorBg);
  set("--color-error-text", map.colorErrorTextHover);

  set("--ant-color-primary", map.colorPrimary);
  set("--ant-color-info", map.colorInfo);
  set("--ant-color-success", map.colorSuccess);
  set("--ant-color-warning", map.colorWarning);
  set("--ant-color-error", map.colorError);
  set("--vxe-ui-font-primary-color", map.colorPrimary);
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

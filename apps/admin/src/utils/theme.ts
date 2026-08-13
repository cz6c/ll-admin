/**
 * 主题与 html class 工具
 * 职责：切换灰色/色弱 class；写入自有 CSS 变量与 Ant Design token 桥接变量
 */

/**
 * 与 theme.scss --font-family 保持一致（ConfigProvider token 需 JS 字符串）
 * Ant Design 5 系统栈 + 中文兜底
 */
export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

/** 与 theme.scss --color-text* 一致（ConfigProvider token） */
export const COLOR_TEXT = "rgba(0, 0, 0, 0.88)";
export const COLOR_TEXT_SECONDARY = "rgba(0, 0, 0, 0.65)";
export const COLOR_TEXT_TERTIARY = "rgba(0, 0, 0, 0.45)";
export const COLOR_TEXT_DISABLED = "rgba(0, 0, 0, 0.25)";

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
 */
export function handleThemeStyle(theme: string) {
  document.documentElement.style.setProperty("--color-primary", theme);
  document.documentElement.style.setProperty("--color-primary-bg", getLightColor(theme, 9 / 10));
  document.documentElement.style.setProperty("--ant-color-primary", theme);
  // VXE 主色与品牌色对齐
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

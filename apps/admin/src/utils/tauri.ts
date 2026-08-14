/**
 * Tauri CS 环境探测与主窗约束
 * 职责：区分 WebView 壳与浏览器；保证主窗客户区不低于设计最小尺寸
 * 适用：工作日报菜单/路由、invoke 前守卫、CS 启动时窗口约束
 */

/** CS 主窗客户区最小宽（逻辑像素），与布局设计下限一致 */
export const CS_WINDOW_MIN_INNER_WIDTH = 1024;
/** CS 主窗客户区最小高（逻辑像素） */
export const CS_WINDOW_MIN_INNER_HEIGHT = 768;

/** 是否运行在 Tauri WebView（CS）内 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * 按「客户区」逻辑像素设置最小窗口；必要时放大当前窗，避免 Windows 无边框外框 min 导致内区偏小裁切
 * @note tauri.conf 的 minWidth/minHeight 约束的是外框，不能单独依赖
 */
export async function ensureCsWindowMinInnerSize(
  width = CS_WINDOW_MIN_INNER_WIDTH,
  height = CS_WINDOW_MIN_INNER_HEIGHT
): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const minSize = new LogicalSize(width, height);
    await win.setMinSize(minSize);

    const factor = await win.scaleFactor();
    const inner = (await win.innerSize()).toLogical(factor);
    const nextW = Math.max(inner.width, width);
    const nextH = Math.max(inner.height, height);
    if (nextW > inner.width || nextH > inner.height) {
      await win.setSize(new LogicalSize(nextW, nextH));
    }
  } catch {
    /* Web 预览或 window API 不可用时忽略 */
  }
}

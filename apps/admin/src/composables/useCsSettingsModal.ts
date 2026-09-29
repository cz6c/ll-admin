/**
 * CS 应用设置全局弹窗
 * 职责：跨顶栏、托盘、相册空态等入口统一开关；保存后可回调刷新当前页
 * 适用：Tauri CS 壳；挂载 SettingsModal（CcSettingsModal）于 App.vue
 */

/** 打开弹窗时的可选上下文 */
export interface CsSettingsOpenOptions {
  /** 保存成功后的页面级刷新（如相册空态补扫） */
  onSaved?: () => void | Promise<void>;
}

const visible = ref(false);
let pendingOnSaved: (() => void | Promise<void>) | undefined;

/**
 * CS 应用设置全局弹窗状态与操作
 */
export function useCsSettingsModal() {
  /**
   * 打开应用设置弹窗
   * @param options 来源上下文与保存后回调
   */
  function open(options?: CsSettingsOpenOptions) {
    pendingOnSaved = options?.onSaved;
    visible.value = true;
  }

  /** 关闭弹窗并清理一次性回调 */
  function close() {
    visible.value = false;
    pendingOnSaved = undefined;
  }

  /**
   * 保存成功后：执行打开时注册的 onSaved，再关闭
   */
  async function notifySaved() {
    const cb = pendingOnSaved;
    pendingOnSaved = undefined;
    if (cb) {
      await cb();
    }
    close();
  }

  return {
    visible,
    open,
    close,
    notifySaved
  };
}

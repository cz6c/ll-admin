import type { InjectionKey, Ref } from "vue";

/** MediaLightboxShell 顶栏工具区挂载点；缩放工具栏 Teleport 至此，避免挡在 Live 图上 */
export const MEDIA_LIGHTBOX_TOOLBAR_KEY: InjectionKey<Ref<HTMLElement | null>> = Symbol("mediaLightboxToolbar");

import type { InjectionKey, Ref } from "vue";

/**
 * 重复清理弹窗滚动根，供 lazy 缩略图 IntersectionObserver
 * - 纵向：弹窗列表容器
 * - 横向：同组成员条（改横滑后必须单独提供，否则屏外成员也会被当成可见）
 */
export const DUP_LIST_SCROLL_KEY: InjectionKey<Ref<HTMLElement | null>> = Symbol("dupListScroll");

/** 同组横向成员滚动容器 */
export const DUP_GROUP_HSCROLL_KEY: InjectionKey<Ref<HTMLElement | null>> = Symbol("dupGroupHScroll");

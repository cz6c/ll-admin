import type { InjectionKey, Ref } from "vue";

/** 重复清理弹窗列表滚动容器，供 lazy 缩略图 IntersectionObserver root */
export const DUP_LIST_SCROLL_KEY: InjectionKey<Ref<HTMLElement | null>> = Symbol("dupListScroll");

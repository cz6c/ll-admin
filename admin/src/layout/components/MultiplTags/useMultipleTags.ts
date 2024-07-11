import { toRaw, ref, nextTick } from "vue";
import type { RouteLocationNormalized } from "vue-router";
import { useSortable } from "@/hooks/useSortable";
import { useMultiTagsStore } from "@/store/modules/multiTags";
import { isNullAndUnDef } from "@/utils/is";
import { useRouter } from "vue-router";

export function initAffixTags(): string[] {
  const affixList = ref<RouteLocationNormalized[]>([]);
  const multiTagsStore = useMultiTagsStore();
  const router = useRouter();
  /**
   * @description: 筛选 affix tag
   */
  function filterAffixTags(routes: RouteLocationNormalized[]) {
    const tags: RouteLocationNormalized[] = [];
    routes &&
      routes.forEach(route => {
        if (route.meta && route.meta.affix) {
          tags.push(toRaw(route));
        }
      });
    return tags;
  }

  /**
   * @description: 新增 affix tag
   */
  function addAffixTags(): void {
    const affixTags = filterAffixTags(router.getRoutes() as unknown as RouteLocationNormalized[]);
    affixList.value = affixTags;
    for (const tag of affixTags) {
      multiTagsStore.addTag({
        name: tag.name as string,
        path: tag.path,
        meta: tag.meta,
        fullPath: tag.fullPath || tag.path,
      });
    }
  }

  let isAddAffix = false;

  if (!isAddAffix) {
    addAffixTags();
    isAddAffix = true;
  }
  return affixList.value.map(item => item.meta?.title).filter(Boolean) as string[];
}

export function useTagsDrag(affixTextList: string[]) {
  const multiTagsStore = useMultiTagsStore();
  nextTick(() => {
    const el = document.querySelectorAll(`.multiple-tags`)?.[0] as HTMLElement;
    const { initSortable } = useSortable(el, {
      filter: (e: any) => {
        const text = e?.target?.innerText;
        if (!text) return false;
        return affixTextList.includes(text);
      },
      onEnd: evt => {
        const { oldIndex, newIndex } = evt;

        if (isNullAndUnDef(oldIndex) || isNullAndUnDef(newIndex) || oldIndex === newIndex) {
          return;
        }

        multiTagsStore.sortTags(oldIndex, newIndex);
      },
    });
    initSortable();
  });
}

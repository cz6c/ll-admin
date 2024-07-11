import { defineStore } from "pinia";
import store from "@/store";
import type { RouteMeta, Router } from "vue-router";
import { useRedo } from "@/hooks/usePage";
import { unref, toRaw } from "vue";
import { RouterEnum } from "@/router";

export type MultiTagsItem = {
  name: string;
  path: string;
  meta: RouteMeta;
  fullPath: string;
};

interface TagsState {
  multiTags: MultiTagsItem[];
  cachedPages: Set<string>;
}

export const multiTagsStore = defineStore("multiTags", {
  state: (): TagsState => ({
    // 标签页
    multiTags: [],
    // 缓存页
    cachedPages: new Set(),
  }),
  getters: {
    /**
     * @description: 获取标签页数组
     * @return {*}
     */
    getMultiTags(): MultiTagsItem[] {
      return this.multiTags;
    },
    /**
     * @description: 获取页面缓存数组
     * @return {*}
     */
    getcachedPages(): string[] {
      return Array.from(this.cachedPages);
    },
  },
  actions: {
    /**
     * @description: 清空缓存
     */
    clearCached(): void {
      this.cachedPages = new Set();
    },
    /**
     * @description: 重置
     */
    resetState(): void {
      this.multiTags = [];
      this.clearCached();
    },
    /**
     * @description: 根据当前标签更新缓存
     */
    async updateCache() {
      const cacheMap: Set<string> = new Set();
      for (const tag of this.multiTags) {
        // Ignore the cache
        const needCache = !tag.meta.ignoreKeepAlive;
        if (!needCache) {
          continue;
        }
        const name = tag.name;
        cacheMap.add(name);
      }
      this.cachedPages = cacheMap;
    },
    /**
     * @description: 新增标签页
     * @param {MultiTagsItem} tag
     */
    async addTag(tag: MultiTagsItem) {
      const { path, fullPath, meta } = tag;
      if (meta.hideTag) return;
      let updateIndex = -1;
      const hasExits = this.multiTags.some((tag, index) => {
        updateIndex = index;
        return (tag.fullPath || tag.path) === (fullPath || path);
      });
      // 如果已经存在，则执行更新操作
      if (hasExits) {
        const currentTag = toRaw(this.multiTags)[updateIndex];
        if (!currentTag) {
          return;
        }
        // currentTag.fullPath = fullPath || currentTag.fullPath;
        this.multiTags.splice(updateIndex, 1, currentTag);
      } else {
        // add tag
        this.multiTags.push(tag);
      }
      // 更新缓存列表
      this.updateCache();
      // 如果标签页需要持久化则进行本地存储操作
    },
    /**
     * @description: 关闭tag
     * @param {MultiTagsItem} tag
     * @param {Router} router
     */
    async closeTag(tag: MultiTagsItem, router: Router) {
      const close = (fullPath: string) => {
        const index = this.multiTags.findIndex(item => item.fullPath === fullPath);
        index !== -1 && this.multiTags.splice(index, 1);
      };
      const { currentRoute, replace } = router;
      const { fullPath } = unref(currentRoute);
      // 关闭 不是当前活跃标签页
      if (fullPath !== tag.fullPath) {
        close(tag.fullPath!);
        this.updateCache();
        return;
      }
      // 关闭 当前活跃标签页
      let toPath = "";
      const index = this.multiTags.findIndex(item => item.fullPath === fullPath);
      // 如果当前是最左边的tag
      if (index === 0) {
        // 只有一个tag，则跳转到首页，否则跳转到右边tag
        if (this.multiTags.length === 1) {
          toPath = RouterEnum.BASE_HOME_PATH;
        } else {
          const page = this.multiTags[index + 1];
          toPath = page.fullPath;
        }
      } else {
        const page = this.multiTags[index - 1];
        toPath = page.fullPath;
      }
      close(unref(currentRoute).fullPath);
      await replace(toPath);
    },
    /**
     * @description: 关闭所有tag
     * @param {Router} router
     */
    async closeAllTags(router: Router) {
      this.multiTags = this.multiTags.filter(item => item?.meta?.affix ?? false);
      this.clearCached();
      const len = this.multiTags.length;
      const { path } = unref(router.currentRoute);
      let toPath: string = RouterEnum.BASE_HOME_PATH;
      if (len > 0) {
        const page = this.multiTags[0];
        toPath = page.fullPath;
      }
      path !== toPath && router.replace(toPath);
    },
    /**
     * @description: 关闭其他标签页
     * @param {MultiTagsItem} tag
     */
    async closeOtherTags(tag: MultiTagsItem) {
      const fullPathList = this.multiTags.map(item => item.fullPath);
      const closePathList: string[] = [];
      const currentPath = tag.fullPath || tag.path;
      for (const fullPath of fullPathList) {
        if (fullPath !== currentPath) {
          const closeItem = this.multiTags.find(item => item.fullPath === fullPath);
          if (!closeItem) {
            continue;
          }
          const affix = closeItem?.meta?.affix ?? false;
          if (!affix) {
            closePathList.push(closeItem.fullPath);
          }
        }
      }
      this.multiTags = this.multiTags.filter(item => !closePathList.includes(item.fullPath));
      this.updateCache();
    },
    /**
     * @description: 拖动排序
     * @param {number} oldIndex
     * @param {number} newIndex
     */
    async sortTags(oldIndex: number, newIndex: number) {
      const currentTag = this.multiTags[oldIndex];
      this.multiTags.splice(oldIndex, 1);
      this.multiTags.splice(newIndex, 0, currentTag);
    },
    /**
     * @description: 重新加载
     * @param {Router} router
     */
    async refreshPage(router: Router) {
      const { name } = unref(router.currentRoute);
      const findTag = this.getcachedPages.find(item => item === name);
      if (findTag) {
        this.cachedPages.delete(findTag);
      }
      const { redo } = useRedo(router);
      await redo();
    },
  },
});

export function useMultiTagsStore() {
  return multiTagsStore(store);
}

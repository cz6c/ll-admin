import router from "@/router";

export const useTagsViewStore = defineStore("tags-view", {
  state: () => ({
    visitedViews: [], // 已浏览页签route
    cachedViews: [] // 已缓存页签names
  }),
  actions: {
    addView(view) {
      this.addVisitedView(view);
      this.addCachedView(view);
    },
    addVisitedView(view) {
      if (this.visitedViews.some(v => v.path === view.path)) return;
      if (view.meta.affix) {
        this.visitedViews.unshift(
          Object.assign({}, view, {
            title: view.meta.title || "no-name"
          })
        );
      } else {
        this.visitedViews.push(
          Object.assign({}, view, {
            title: view.meta.title || "no-name"
          })
        );
      }
    },
    addCachedView(view) {
      if (this.cachedViews.includes(view.name)) return;
      if (!view.meta.noCache) {
        this.cachedViews.push(view.name);
      }
    },
    delView(view) {
      return new Promise(resolve => {
        this.delVisitedView(view);
        this.delCachedView(view);
        resolve({
          visitedViews: [...this.visitedViews],
          cachedViews: [...this.cachedViews]
        });
      });
    },
    delVisitedView(view) {
      return new Promise(resolve => {
        for (const [i, v] of this.visitedViews.entries()) {
          if (v.path === view.path) {
            this.visitedViews.splice(i, 1);
            break;
          }
        }
        resolve([...this.visitedViews]);
      });
    },
    delCachedView(view) {
      return new Promise(resolve => {
        const index = this.cachedViews.indexOf(view.name);
        index > -1 && this.cachedViews.splice(index, 1);
        resolve([...this.cachedViews]);
      });
    },
    delOthersViews(view) {
      return new Promise(resolve => {
        this.delOthersVisitedViews(view);
        this.delOthersCachedViews(view);
        resolve({
          visitedViews: [...this.visitedViews],
          cachedViews: [...this.cachedViews]
        });
      });
    },
    delOthersVisitedViews(view) {
      return new Promise(resolve => {
        this.visitedViews = this.visitedViews.filter(v => {
          return v.meta.affix || v.path === view.path;
        });
        resolve([...this.visitedViews]);
      });
    },
    delOthersCachedViews(view) {
      return new Promise(resolve => {
        const index = this.cachedViews.indexOf(view.name);
        if (index > -1) {
          this.cachedViews = this.cachedViews.slice(index, index + 1);
        } else {
          this.cachedViews = [];
        }
        resolve([...this.cachedViews]);
      });
    },
    delAllViews() {
      return new Promise(resolve => {
        this.delAllVisitedViews();
        this.delAllCachedViews();
        resolve({
          visitedViews: [...this.visitedViews],
          cachedViews: [...this.cachedViews]
        });
      });
    },
    delAllVisitedViews() {
      return new Promise(resolve => {
        const affixTags = this.visitedViews.filter(tag => tag.meta.affix);
        this.visitedViews = affixTags;
        resolve([...this.visitedViews]);
      });
    },
    delAllCachedViews() {
      return new Promise(resolve => {
        this.cachedViews = [];
        resolve([...this.cachedViews]);
      });
    },
    updateVisitedView(view) {
      for (let v of this.visitedViews) {
        if (v.path === view.path) {
          v = Object.assign(v, view);
          break;
        }
      }
    },
    delRightViews(view) {
      return new Promise(resolve => {
        const index = this.visitedViews.findIndex(v => v.path === view.path);
        if (index === -1) {
          return;
        }
        this.visitedViews = this.visitedViews.filter((item, idx) => {
          if (idx <= index || (item.meta && item.meta.affix)) {
            return true;
          }
          const i = this.cachedViews.indexOf(item.name);
          if (i > -1) {
            this.cachedViews.splice(i, 1);
          }
          return false;
        });
        resolve([...this.visitedViews]);
      });
    },
    delLeftViews(view) {
      return new Promise(resolve => {
        const index = this.visitedViews.findIndex(v => v.path === view.path);
        if (index === -1) {
          return;
        }
        this.visitedViews = this.visitedViews.filter((item, idx) => {
          if (idx >= index || (item.meta && item.meta.affix)) {
            return true;
          }
          const i = this.cachedViews.indexOf(item.name);
          if (i > -1) {
            this.cachedViews.splice(i, 1);
          }
          return false;
        });
        resolve([...this.visitedViews]);
      });
    },
    // 刷新当前tab页签
    refreshPage(view) {
      const { path, query, matched } = router.currentRoute.value;
      if (view === undefined) {
        matched.forEach(m => {
          if (m.components && m.components.default && m.components.default.name) {
            if (!["Layout"].includes(m.components.default.name)) {
              view = { name: m.components.default.name, path: path, query: query };
            }
          }
        });
      }
      return this.delCachedView(view).then(() => {
        const { path, query } = view;
        router.replace({
          path: "/redirect" + path,
          query: query
        });
      });
    },
    // 关闭指定tab页签
    closePage(view) {
      if (view === undefined) {
        return this.delView(router.currentRoute.value).then(({ visitedViews }) => {
          const latestView = visitedViews.slice(-1)[0];
          if (latestView) {
            return router.push(latestView.fullPath);
          }
          return router.push("/");
        });
      }
      return this.delView(view);
    }
  },
  persist: {
    storage: sessionStorage
  }
});

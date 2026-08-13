<template>
  <div class="header-search">
    <IconifyIcon class="search-icon" icon="ant-design:search-outlined" width="16px" height="16px" />
    <a-select
      v-model:value="search"
      show-search
      :filter-option="false"
      :options="options"
      placeholder="搜索菜单"
      class="header-search-select"
      :bordered="false"
      :suffix-icon="null"
      :not-found-content="searchKeyword ? undefined : null"
      @search="querySearch"
      @change="onChange"
      @blur="onBlur"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 顶栏路由模糊搜索
 * 职责：Fuse.js 检索侧栏路由；a-select 联想选中后跳转
 * @note 下拉宽度跟整块 .header-search（含图标区）一致，故 Select 铺满容器
 */
import Fuse from "fuse.js";
import { isHttp } from "@llcz/common";
import { usePermissionStore } from "@/store/modules/permission";
import { openWindow } from "@/utils";

defineOptions({
  name: "HeaderSearch"
});

type RouteSearchItem = { path: string; title: string[] };
type SelectOption = { label: string; value: string; item: RouteSearchItem };

const search = ref<string | undefined>(undefined);
const searchKeyword = ref("");
const options = ref<SelectOption[]>([]);
const searchPool = ref<RouteSearchItem[]>([]);
const fuse = ref<Fuse<RouteSearchItem> | undefined>(undefined);
const router = useRouter();
const routes = computed(() => usePermissionStore().routes);

function onBlur() {
  options.value = [];
  searchKeyword.value = "";
}

function navigate(hit: RouteSearchItem) {
  if (isHttp(hit.path)) {
    const pindex = hit.path.indexOf("http");
    void openWindow(hit.path.substr(pindex, hit.path.length));
  } else {
    router.push(hit.path);
  }
  search.value = undefined;
  options.value = [];
}

function onChange(path: string) {
  if (!path) return;
  const hit = options.value.find(o => o.value === path)?.item;
  if (!hit) return;
  navigate(hit);
}

function initFuse(list: RouteSearchItem[]) {
  fuse.value = new Fuse(list, {
    shouldSort: true,
    threshold: 0.4,
    location: 0,
    distance: 100,
    minMatchCharLength: 1,
    keys: [
      { name: "title", weight: 0.7 },
      { name: "path", weight: 0.3 }
    ]
  });
}

/** 侧栏可见路由 → 可检索池（含面包屑 title 链） */
function generateRoutes(routes: any[], prefixTitle: string[] = []): RouteSearchItem[] {
  let res: RouteSearchItem[] = [];

  for (const r of routes) {
    if (r.hidden) continue;
    const p = r.path.length > 0 && r.path[0] === "/" ? r.path : "/" + r.path;
    const data: RouteSearchItem = {
      path: !isHttp(r.path) ? p : r.path,
      title: [...prefixTitle]
    };

    if (r.meta && r.meta.title) {
      data.title = [...data.title, r.meta.title];
      if (r.redirect !== "noRedirect") {
        res.push(data);
      }
    }

    if (r.children) {
      const tempRoutes = generateRoutes(r.children, data.title);
      if (tempRoutes.length >= 1) {
        res = [...res, ...tempRoutes];
      }
    }
  }
  return res;
}

function querySearch(query: string) {
  searchKeyword.value = query;
  if (query !== "" && fuse.value) {
    options.value = fuse.value.search(query).map(r => ({
      label: r.item.title.join(" > "),
      value: r.item.path,
      item: r.item
    }));
  } else {
    options.value = [];
  }
}

onMounted(() => {
  searchPool.value = generateRoutes(routes.value);
});

watchEffect(() => {
  searchPool.value = generateRoutes(routes.value);
});

watch(searchPool, list => {
  initFuse(list);
});
</script>

<style lang="scss" scoped>
.header-search {
  position: relative;
  width: 180px;
  height: 32px;
  border-radius: 6px;
  box-sizing: border-box;

  .search-icon {
    position: absolute;
    left: 8px;
    top: 50%;
    z-index: 1;
    transform: translateY(-50%);
    color: var(--color-text-tertiary);
    pointer-events: none;
  }

  .header-search-select {
    width: 100%;
    font-size: 14px;

    :deep(.ant-select-selector) {
      height: 32px !important;
      padding-inline: 28px 0 !important;
      border: 0 !important;
    }

    :deep(.ant-select-selection-search) {
      inset-inline-start: 28px !important;
      inset-inline-end: 0 !important;
    }

    :deep(.ant-select-selection-search-input) {
      height: 32px !important;
    }

    :deep(.ant-select-selection-placeholder),
    :deep(.ant-select-selection-item) {
      line-height: 32px !important;
      padding-inline: 0 !important;
    }

    :deep(.ant-select-arrow) {
      display: none;
    }
  }
}
</style>

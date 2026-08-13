<template>
  <div class="app-page">
    <a-row :gutter="16">
      <a-col :span="8">
        <a-card style="height: calc(100vh - var(--cs-shell-bar-height) - 125px)">
          <template #title>
            <div class="flex-center justify-between">
              <span class="flex-center"><IconifyIcon class="mr-1" icon="ant-design:database-outlined" />缓存列表</span>
              <a-button type="link" @click="refreshCacheNames()">
                <template #icon>
                  <component :is="useRenderIcon('ant-design:reload-outlined')" />
                </template>
              </a-button>
            </div>
          </template>
          <a-table
            :loading="loading"
            :columns="cacheNameColumns"
            :data-source="cacheNames"
            :pagination="false"
            :scroll="{ y: tableHeight }"
            :custom-row="cacheNameCustomRow"
            row-key="cacheName"
            size="small"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'index'">{{ index + 1 }}</template>
              <template v-else-if="column.key === 'cacheName'">{{ nameFormatter(record) }}</template>
              <template v-else-if="column.key === 'action'">
                <a-button type="link" @click.stop="handleClearCacheName(record)">
                  <template #icon>
                    <component :is="useRenderIcon('ant-design:delete-outlined')" />
                  </template>
                </a-button>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>

      <a-col :span="8">
        <a-card style="height: calc(100vh - var(--cs-shell-bar-height) - 125px)">
          <template #title>
            <div class="flex-center justify-between">
              <span class="flex-center"><IconifyIcon class="mr-1" icon="ant-design:key-outlined" />键名列表</span>
              <a-button type="link" @click="refreshCacheKeys()">
                <template #icon>
                  <component :is="useRenderIcon('ant-design:reload-outlined')" />
                </template>
              </a-button>
            </div>
          </template>
          <a-table
            :loading="subLoading"
            :columns="cacheKeyColumns"
            :data-source="cacheKeyRows"
            :pagination="false"
            :scroll="{ y: tableHeight }"
            :custom-row="cacheKeyCustomRow"
            row-key="cacheKey"
            size="small"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'index'">{{ index + 1 }}</template>
              <template v-else-if="column.key === 'cacheKey'">{{ keyFormatter(record.cacheKey) }}</template>
              <template v-else-if="column.key === 'action'">
                <a-button type="link" @click.stop="handleClearCacheKey(record.cacheKey)">
                  <template #icon>
                    <component :is="useRenderIcon('ant-design:delete-outlined')" />
                  </template>
                </a-button>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>

      <a-col :span="8">
        <a-card :bordered="false" style="height: calc(100vh - var(--cs-shell-bar-height) - 125px)">
          <template #title>
            <div class="flex-center justify-between">
              <span class="flex-center"><IconifyIcon class="mr-1" icon="ant-design:file-text-outlined" />缓存内容</span>
            </div>
          </template>
          <a-form :model="cacheForm" :label-col="{ style: { width: '90px' } }">
            <a-row :gutter="32">
              <a-col :offset="1" :span="22">
                <a-form-item label="缓存名称:" name="cacheName">
                  <a-input v-model:value="cacheForm.cacheName" readonly />
                </a-form-item>
              </a-col>
              <a-col :offset="1" :span="22">
                <a-form-item label="缓存键名:" name="cacheKey">
                  <a-input v-model:value="cacheForm.cacheKey" readonly />
                </a-form-item>
              </a-col>
              <a-col :offset="1" :span="22">
                <a-form-item label="缓存内容:" name="cacheValue">
                  <a-textarea v-model:value="cacheForm.cacheValue" :rows="8" readonly />
                </a-form-item>
              </a-col>
            </a-row>
          </a-form>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
/**
 * 缓存监控
 * 职责：按缓存名 → 键名 → 内容三级浏览，并支持按名/按键清理
 * 适用：monitor/cache
 */
import type { TableColumnsType } from "ant-design-vue";
import { CacheData } from "#/api/monitor/cache";
import { listCacheName, listCacheKey, getCacheValue, clearCacheName, clearCacheKey } from "@/api/monitor/cache";
import { useRenderIcon } from "@/hooks/useRenderIcon";
import $feedback from "@/utils/feedback";

defineOptions({
  name: "CacheList"
});

const cacheNames = ref<CacheData[]>([]);
const cacheKeys = ref<string[]>([]);
const cacheForm = ref({} as CacheData);
const loading = ref(true);
const subLoading = ref(false);
const nowCacheName = ref("");
const tableHeight = ref(window.innerHeight - 200);

/** 键名表行：字符串列表转 a-table dataSource */
const cacheKeyRows = computed(() => cacheKeys.value.map(cacheKey => ({ cacheKey })));

const cacheNameColumns: TableColumnsType = [
  { title: "序号", key: "index", width: 60 },
  { title: "缓存名称", key: "cacheName", dataIndex: "cacheName", align: "center", ellipsis: true },
  { title: "备注", dataIndex: "remark", align: "center", ellipsis: true },
  { title: "操作", key: "action", width: 60, align: "center" }
];

const cacheKeyColumns: TableColumnsType = [
  { title: "序号", key: "index", width: 60 },
  { title: "缓存键名", key: "cacheKey", dataIndex: "cacheKey", align: "center", ellipsis: true },
  { title: "操作", key: "action", width: 60, align: "center" }
];

/** 查询缓存名称列表 */
function getCacheNames() {
  loading.value = true;
  listCacheName().then(response => {
    cacheNames.value = response.data;
    loading.value = false;
  });
}

/** 刷新缓存名称列表 */
function refreshCacheNames() {
  getCacheNames();
  $feedback.message.success("刷新缓存列表成功");
}

/** 清理指定名称缓存 */
function handleClearCacheName(row: CacheData) {
  clearCacheName(row.cacheName).then(() => {
    $feedback.message.success("清理缓存名称[" + row.cacheName + "]成功");
    getCacheKeys();
  });
}

/** 查询缓存键名列表 */
function getCacheKeys(row: { cacheName?: string } | undefined = undefined) {
  const cacheName = row !== undefined ? row.cacheName : nowCacheName.value;
  if (cacheName === "") {
    return;
  }
  subLoading.value = true;
  listCacheKey(cacheName!).then(response => {
    cacheKeys.value = response.data;
    subLoading.value = false;
    nowCacheName.value = cacheName!;
  });
}

/** 刷新缓存键名列表 */
function refreshCacheKeys() {
  getCacheKeys();
  $feedback.message.success("刷新键名列表成功");
}

/** 清理指定键名缓存 */
function handleClearCacheKey(cacheKey: string) {
  clearCacheKey(cacheKey).then(() => {
    $feedback.message.success("清理缓存键名[" + cacheKey + "]成功");
    getCacheKeys();
  });
}

/** 列表前缀去除 */
function nameFormatter(row: CacheData) {
  return row.cacheName.replace(":", "");
}

/** 键名前缀去除 */
function keyFormatter(cacheKey: string) {
  return cacheKey.replace(nowCacheName.value, "");
}

/** 查询缓存内容详细 */
function handleCacheValue(cacheKey: string) {
  getCacheValue(nowCacheName.value, cacheKey).then(response => {
    cacheForm.value = response.data;
  });
}

const cacheNameCustomRow = (record: CacheData) => ({
  onClick: () => getCacheKeys(record)
});

const cacheKeyCustomRow = (record: { cacheKey: string }) => ({
  onClick: () => handleCacheValue(record.cacheKey)
});

getCacheNames();
</script>

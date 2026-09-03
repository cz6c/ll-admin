/**
 * 清理重复下载弹窗
 * 职责：平铺分组列表 + 视口 lazy 缩略图；content-visibility 减轻长列表滚动开销
 */
<script setup lang="ts">
import DuplicateGroupCard from "./DuplicateGroupCard.vue";
import { deleteAlbumLocal, findAlbumLocalDuplicates } from "@/api/album";
import { DUP_LIST_SCROLL_KEY } from "../duplicateListScroll";
import { message } from "ant-design-vue";
import type { DuplicateGroup, DuplicateLegacyItem } from "../types";

const open = defineModel<boolean>("open", { default: false });

const emit = defineEmits<{
  deleted: [];
}>();

defineOptions({ name: "DuplicateCleanupModal" });

const loading = ref(false);
const deleting = ref(false);
const error = ref("");
const groups = shallowRef<DuplicateGroup[]>([]);
const selectedPaths = ref<Set<string>>(new Set());
const listScrollRef = ref<HTMLElement | null>(null);

provide(DUP_LIST_SCROLL_KEY, listScrollRef);

function duplicatePath(item: DuplicateLegacyItem): string {
  return item.duplicate.path;
}

function allDuplicatePaths(list: DuplicateGroup[]): string[] {
  const paths: string[] = [];
  for (const group of list) {
    for (const item of group.duplicates) {
      paths.push(duplicatePath(item));
    }
  }
  return paths;
}

const totalDuplicates = computed(() => allDuplicatePaths(groups.value).length);

const hasAmbiguousStem = computed(() => groups.value.some(g => g.ambiguousStem));

const ambiguousGroupCount = computed(() => groups.value.filter(g => g.ambiguousStem).length);

/** 仅当该组勾选状态变化时触发子组件更新（配合 v-memo） */
function groupSelectionToken(group: DuplicateGroup): string {
  let token = "";
  for (const item of group.duplicates) {
    token += selectedPaths.value.has(duplicatePath(item)) ? "1" : "0";
  }
  return token;
}

async function loadGroups() {
  loading.value = true;
  error.value = "";
  groups.value = [];
  selectedPaths.value = new Set();
  try {
    const result = await findAlbumLocalDuplicates();
    groups.value = result;
    selectedPaths.value = new Set(allDuplicatePaths(result));
  } catch (e: unknown) {
    error.value = typeof e === "string" ? e : "扫描重复文件失败";
  } finally {
    loading.value = false;
  }
}

watch(open, val => {
  if (val) void loadGroups();
});

function toggleDuplicate(path: string, checked: boolean) {
  const next = new Set(selectedPaths.value);
  if (checked) next.add(path);
  else next.delete(path);
  selectedPaths.value = next;
}

function toggleAll(checked: boolean) {
  if (checked) {
    selectedPaths.value = new Set(allDuplicatePaths(groups.value));
  } else {
    selectedPaths.value = new Set();
  }
}

function toggleGroupDuplicates(group: DuplicateGroup, checked: boolean) {
  const next = new Set(selectedPaths.value);
  for (const item of group.duplicates) {
    const path = duplicatePath(item);
    if (checked) next.add(path);
    else next.delete(path);
  }
  selectedPaths.value = next;
}

const allSelected = computed(
  () => totalDuplicates.value > 0 && selectedPaths.value.size === totalDuplicates.value
);
const indeterminate = computed(
  () => selectedPaths.value.size > 0 && selectedPaths.value.size < totalDuplicates.value
);

async function onDeleteSelected() {
  const paths = [...selectedPaths.value];
  if (paths.length === 0) return;

  deleting.value = true;
  error.value = "";
  try {
    const pathSet = new Set(paths);
    const extraMov: string[] = [];
    for (const group of groups.value) {
      for (const item of group.duplicates) {
        if (!pathSet.has(duplicatePath(item))) continue;
        const mov = item.duplicate.videoPath?.trim();
        if (mov) extraMov.push(mov);
      }
    }
    await deleteAlbumLocal([...paths, ...extraMov]);

    groups.value = groups.value
      .map(group => ({
        ...group,
        duplicates: group.duplicates.filter(item => !pathSet.has(duplicatePath(item)))
      }))
      .filter(group => group.duplicates.length > 0);

    selectedPaths.value = new Set();
    message.success(`已删除 ${paths.length} 个重复副本`);
    emit("deleted");
  } catch (e: unknown) {
    error.value = typeof e === "string" ? e : "删除失败";
    throw e;
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <a-modal
    v-model:open="open"
    title="清理重复下载"
    width="min(920px, 96vw)"
    wrap-class-name="dup-cleanup-modal-wrap"
    :confirm-loading="deleting"
    ok-text="删除所选"
    cancel-text="关闭"
    :ok-button-props="{ disabled: selectedPaths.size === 0, danger: true }"
    @ok="onDeleteSelected"
  >
    <div class="dup-modal-layout">
      <div class="dup-modal-top">
        <p class="dup-intro">
          按 iCloud 同步正本分组：每组保留左侧 1 份，右侧为可删的旧 icloudpd 或 sync 目录内旧命名副本。
        </p>

        <a-spin :spinning="loading">
          <a-alert v-if="error" type="error" :message="error" show-icon class="dup-alert" />

          <a-alert
            v-if="hasAmbiguousStem && groups.length > 0"
            type="warning"
            show-icon
            class="dup-alert"
            message="部分组存在 stem 歧义"
            :description="`有 ${ambiguousGroupCount} 组正本共用相同文件名 stem，按 stem 匹配可能不准，删除前请对照缩略图与路径。`"
          />

          <a-empty v-if="!loading && !error && groups.length === 0" description="未发现重复下载" />

          <div v-else-if="groups.length > 0" class="dup-toolbar">
            <a-checkbox :checked="allSelected" :indeterminate="indeterminate" @change="(e: { target: { checked: boolean } }) => toggleAll(e.target.checked)">
              全选副本（{{ selectedPaths.size }} / {{ totalDuplicates }}）
            </a-checkbox>
          </div>
        </a-spin>
      </div>

      <div v-if="groups.length > 0" ref="listScrollRef" class="dup-list">
        <DuplicateGroupCard
          v-for="group in groups"
          :key="group.assetId"
          v-memo="[group.assetId, group.duplicates.length, groupSelectionToken(group)]"
          :group="group"
          :selected-paths="selectedPaths"
          @toggle-duplicate="toggleDuplicate"
          @toggle-group="checked => toggleGroupDuplicates(group, checked)"
        />
      </div>
    </div>
  </a-modal>
</template>

<style scoped lang="scss">
.dup-modal-layout {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: calc(100vh - 10rem);
}

.dup-modal-top {
  flex-shrink: 0;
}

.dup-intro {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.dup-alert {
  margin-bottom: 12px;
}

.dup-toolbar {
  margin-bottom: 10px;
}

/** 唯一滚动区：占满弹窗剩余高度，说明/全选固定在上方 */
.dup-list {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
}
</style>

<style lang="scss">
.dup-cleanup-modal-wrap .ant-modal-body {
  overflow: hidden;
}
</style>

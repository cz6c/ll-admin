/**
 * 清理重复下载弹窗
 * 职责：平铺分组列表 + 视口 lazy 缩略图；content-visibility 减轻长列表滚动开销
 */
<script setup lang="ts">
import DuplicateGroupCard from "./DuplicateGroupCard.vue";
import { deleteAlbumLocal, findAlbumLocalDuplicates } from "@/api/album";
import { DUP_LIST_SCROLL_KEY } from "../duplicateListScroll";
import { message } from "ant-design-vue";
import type { DuplicateGroup, DuplicateLegacyItem, DuplicateMatchConfidence } from "../types";

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

/** 置信度展示序：高 → 中 → 低 */
const CONFIDENCE_RANK: Record<DuplicateMatchConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2
};

/**
 * 组内副本按置信度从高到低排序；同档保持相对顺序
 */
function sortDuplicatesByConfidence(items: DuplicateLegacyItem[]): DuplicateLegacyItem[] {
  return [...items].sort(
    (a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]
  );
}

/** 组的最高置信度档（数值越小越高） */
function groupBestConfidenceRank(group: DuplicateGroup): number {
  let best = CONFIDENCE_RANK.low;
  for (const item of group.duplicates) {
    const rank = CONFIDENCE_RANK[item.confidence];
    if (rank < best) best = rank;
  }
  return best;
}

/**
 * 组列表按置信度从高到低：先比组内最高档，再比高置信副本数，最后 contentKey
 */
function sortGroupsByConfidence(list: DuplicateGroup[]): DuplicateGroup[] {
  return [...list].sort((a, b) => {
    const rankDiff = groupBestConfidenceRank(a) - groupBestConfidenceRank(b);
    if (rankDiff !== 0) return rankDiff;
    const highA = a.duplicates.filter(d => d.confidence === "high").length;
    const highB = b.duplicates.filter(d => d.confidence === "high").length;
    if (highB !== highA) return highB - highA;
    const keyCmp = a.contentKey.localeCompare(b.contentKey);
    if (keyCmp !== 0) return keyCmp;
    return a.assetId.localeCompare(b.assetId);
  });
}

/** 组内副本排序 + 组列表按置信度排序 */
function prepareDuplicateGroups(list: DuplicateGroup[]): DuplicateGroup[] {
  return sortGroupsByConfidence(
    list.map(group => ({
      ...group,
      duplicates: sortDuplicatesByConfidence(group.duplicates)
    }))
  );
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

/** 高中置信默认勾选；低置信保留兼容默认不选 */
function defaultSelectedPaths(list: DuplicateGroup[]): string[] {
  const paths: string[] = [];
  for (const group of list) {
    for (const item of group.duplicates) {
      if (item.confidence !== "low") {
        paths.push(duplicatePath(item));
      }
    }
  }
  return paths;
}

function iterDuplicateItems(list: DuplicateGroup[]): DuplicateLegacyItem[] {
  const items: DuplicateLegacyItem[] = [];
  for (const group of list) {
    items.push(...group.duplicates);
  }
  return items;
}

const confidenceCounts = computed(() => {
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const item of iterDuplicateItems(groups.value)) {
    if (item.confidence === "high") high += 1;
    else if (item.confidence === "medium") medium += 1;
    else low += 1;
  }
  return { high, medium, low };
});

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
    const result = prepareDuplicateGroups(await findAlbumLocalDuplicates());
    groups.value = result;
    selectedPaths.value = new Set(defaultSelectedPaths(result));
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

function selectByConfidence(level: DuplicateMatchConfidence) {
  const next = new Set(selectedPaths.value);
  for (const item of iterDuplicateItems(groups.value)) {
    if (item.confidence === level) {
      next.add(duplicatePath(item));
    }
  }
  selectedPaths.value = next;
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

    groups.value = prepareDuplicateGroups(
      groups.value
        .map(group => ({
          ...group,
          duplicates: group.duplicates.filter(item => !pathSet.has(duplicatePath(item)))
        }))
        .filter(group => group.duplicates.length > 0)
    );

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
          按文件内容（BLAKE3）归组：高置信（内容一致，含 Live 双轨）与中置信（主画面一致但配对视频不全）默认勾选；请对照缩略图后删除副本。
        </p>

        <a-spin :spinning="loading">
          <a-alert v-if="error" type="error" :message="error" show-icon class="dup-alert" />

          <a-alert
            v-if="hasAmbiguousStem && groups.length > 0"
            type="warning"
            show-icon
            class="dup-alert"
            message="部分组存在多正本"
            :description="`有 ${ambiguousGroupCount} 组内含多个不同的同步落库项，删除前请对照缩略图与路径，确认要保留哪一份。`"
          />

          <a-empty v-if="!loading && !error && groups.length === 0" description="未发现重复下载" />

          <div v-else-if="groups.length > 0" class="dup-toolbar">
            <a-checkbox :checked="allSelected" :indeterminate="indeterminate" @change="(e: { target: { checked: boolean } }) => toggleAll(e.target.checked)">
              全选副本（{{ selectedPaths.size }} / {{ totalDuplicates }}）
            </a-checkbox>
            <span class="dup-conf-stats">
              高 {{ confidenceCounts.high }} · 中 {{ confidenceCounts.medium }} · 低 {{ confidenceCounts.low }}
            </span>
            <a-space :size="8" class="dup-conf-actions">
              <a-button size="small" @click="selectByConfidence('high')">勾选高置信</a-button>
              <a-button size="small" @click="selectByConfidence('medium')">勾选中置信</a-button>
              <a-button size="small" @click="selectByConfidence('low')">勾选低置信</a-button>
            </a-space>
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  margin-bottom: 10px;
}

.dup-conf-stats {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.dup-conf-actions {
  margin-left: auto;
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

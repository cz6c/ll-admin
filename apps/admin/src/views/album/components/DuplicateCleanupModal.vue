/**
 * 清理重复下载弹窗
 * 职责：平铺分组 + 视口 lazy 缩略图（横滑 IO + 生成限流）；同组横向滚动；每组删除至少留 1 项，正本删后晋升
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

/** 组内全部主路径（含建议正本） */
function groupMemberPaths(group: DuplicateGroup): string[] {
  return [group.canonical.path, ...group.duplicates.map(duplicatePath)];
}

/** 一致程度排序：完全一致 → 部分一致 */
const CONFIDENCE_RANK: Record<DuplicateMatchConfidence, number> = {
  high: 0,
  medium: 1
};

/**
 * 组内副本按一致程度排序；同档保持相对顺序
 */
function sortDuplicatesByConfidence(items: DuplicateLegacyItem[]): DuplicateLegacyItem[] {
  return [...items].sort(
    (a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]
  );
}

/** 组内最佳一致程度（数值越小越好） */
function groupBestConfidenceRank(group: DuplicateGroup): number {
  let best = CONFIDENCE_RANK.medium;
  for (const item of group.duplicates) {
    const rank = CONFIDENCE_RANK[item.confidence];
    if (rank < best) best = rank;
  }
  return best;
}

/**
 * 组列表：先比最佳一致程度，再比「完全一致」副本数，最后 contentKey
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

/** 组内/组间按一致程度整理 */
function prepareDuplicateGroups(list: DuplicateGroup[]): DuplicateGroup[] {
  return sortGroupsByConfidence(
    list.map(group => ({
      ...group,
      duplicates: sortDuplicatesByConfidence(group.duplicates)
    }))
  );
}

/** 默认可删路径：各组除建议正本外的全部副本 */
function defaultSelectedPaths(list: DuplicateGroup[]): string[] {
  const paths: string[] = [];
  for (const group of list) {
    for (const item of group.duplicates) {
      paths.push(duplicatePath(item));
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

/** 每组最多勾选 n-1；全选 = 各组去掉建议正本 */
function maxSelectablePaths(list: DuplicateGroup[]): string[] {
  return defaultSelectedPaths(list);
}

const confidenceCounts = computed(() => {
  let high = 0;
  let medium = 0;
  for (const item of iterDuplicateItems(groups.value)) {
    if (item.confidence === "high") high += 1;
    else medium += 1;
  }
  return { high, medium };
});

const maxSelectableCount = computed(() => maxSelectablePaths(groups.value).length);

const hasAmbiguousStem = computed(() => groups.value.some(g => g.ambiguousStem));

const ambiguousGroupCount = computed(() => groups.value.filter(g => g.ambiguousStem).length);

/** 仅当该组勾选状态变化时触发子组件更新（配合 v-memo） */
function groupSelectionToken(group: DuplicateGroup): string {
  let token = "";
  for (const path of groupMemberPaths(group)) {
    token += selectedPaths.value.has(path) ? "1" : "0";
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

/**
 * 勾选成员：同组不得全选光（至少留 1 项未勾选）
 */
function toggleMember(path: string, checked: boolean) {
  const group = groups.value.find(g => groupMemberPaths(g).includes(path));
  if (!group) return;

  const members = groupMemberPaths(group);
  if (checked) {
    const nextSelected = members.filter(p => p === path || selectedPaths.value.has(p));
    if (nextSelected.length >= members.length) {
      message.warning("同组至少保留一项，不能全部勾选删除");
      return;
    }
  }

  const next = new Set(selectedPaths.value);
  if (checked) next.add(path);
  else next.delete(path);
  selectedPaths.value = next;
}

function toggleAll(checked: boolean) {
  if (checked) {
    // 全选可删项：每组留建议正本
    selectedPaths.value = new Set(maxSelectablePaths(groups.value));
  } else {
    selectedPaths.value = new Set();
  }
}

function selectByConfidence(level: DuplicateMatchConfidence) {
  const next = new Set(selectedPaths.value);
  for (const group of groups.value) {
    const members = groupMemberPaths(group);
    for (const item of group.duplicates) {
      if (item.confidence !== level) continue;
      const path = duplicatePath(item);
      const selectedInGroup = members.filter(p => p === path || next.has(p)).length;
      // 勾上后若达到全组数量则跳过，保证至少留 1
      if (selectedInGroup >= members.length) continue;
      next.add(path);
    }
  }
  selectedPaths.value = next;
}

/**
 * 本组勾选：勾选时选中除建议正本外全部；取消则清空本组
 */
function toggleGroupMembers(group: DuplicateGroup, checked: boolean) {
  const next = new Set(selectedPaths.value);
  const members = groupMemberPaths(group);
  if (checked) {
    for (const path of members) {
      if (path === group.canonical.path) next.delete(path);
      else next.add(path);
    }
  } else {
    for (const path of members) next.delete(path);
  }
  selectedPaths.value = next;
}

const allSelected = computed(
  () => maxSelectableCount.value > 0 && selectedPaths.value.size === maxSelectableCount.value
);
const indeterminate = computed(
  () => selectedPaths.value.size > 0 && selectedPaths.value.size < maxSelectableCount.value
);

/**
 * 删除后重组：正本被删则晋升首个剩余副本；仅剩 1 项则不再作为重复组展示
 */
function applyDeleteToGroups(list: DuplicateGroup[], pathSet: Set<string>): DuplicateGroup[] {
  const next: DuplicateGroup[] = [];
  for (const group of list) {
    const canonDeleted = pathSet.has(group.canonical.path);
    const remainDups = group.duplicates.filter(item => !pathSet.has(duplicatePath(item)));

    if (!canonDeleted) {
      if (remainDups.length === 0) continue;
      next.push({ ...group, duplicates: remainDups });
      continue;
    }

    // 正本已删：晋升第一个剩余副本为新正本
    if (remainDups.length === 0) continue;
    if (remainDups.length === 1) continue; // 只剩一份，不再是重复组
    const [promoted, ...rest] = remainDups;
    next.push({
      ...group,
      assetId: `${group.assetId}::${promoted.duplicate.path}`,
      canonical: promoted.duplicate,
      duplicates: rest.map(item => ({
        ...item,
        canonicalSize: promoted.duplicateSize
      }))
    });
  }
  return prepareDuplicateGroups(next);
}

async function onDeleteSelected() {
  const paths = [...selectedPaths.value];
  if (paths.length === 0) return;

  const pathSet = new Set(paths);
  for (const group of groups.value) {
    const members = groupMemberPaths(group);
    const selectedInGroup = members.filter(p => pathSet.has(p)).length;
    if (selectedInGroup >= members.length) {
      message.warning(`「${group.contentKey}」组不能全部删除，请至少保留一项`);
      return;
    }
  }

  deleting.value = true;
  error.value = "";
  try {
    const extraMov: string[] = [];
    for (const group of groups.value) {
      if (pathSet.has(group.canonical.path)) {
        const mov = group.canonical.videoPath?.trim();
        if (mov) extraMov.push(mov);
      }
      for (const item of group.duplicates) {
        if (!pathSet.has(duplicatePath(item))) continue;
        const mov = item.duplicate.videoPath?.trim();
        if (mov) extraMov.push(mov);
      }
    }
    await deleteAlbumLocal([...paths, ...extraMov]);

    groups.value = applyDeleteToGroups(groups.value, pathSet);
    selectedPaths.value = new Set(defaultSelectedPaths(groups.value));
    message.success(`已删除 ${paths.length} 项`);
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
          按内容（BLAKE3）归组；正本：落库 → 完整实况 → 更新时间。同组至少保留一项；「建议保留」也可勾选，删后自动晋升下一份。
        </p>

        <a-spin :spinning="loading">
          <a-alert v-if="error" type="error" :message="error" show-icon class="dup-alert" />

          <a-alert
            v-if="hasAmbiguousStem && groups.length > 0"
            type="warning"
            show-icon
            class="dup-alert"
            message="部分组存在多落库"
            :description="`有 ${ambiguousGroupCount} 组内含多个不同的同步落库项，删除前请对照缩略图与路径。`"
          />

          <a-empty v-if="!loading && !error && groups.length === 0" description="未发现重复下载" />

          <div v-else-if="groups.length > 0" class="dup-toolbar">
            <a-checkbox :checked="allSelected" :indeterminate="indeterminate" @change="(e: { target: { checked: boolean } }) => toggleAll(e.target.checked)">
              全选可删（{{ selectedPaths.size }} / {{ maxSelectableCount }}）
            </a-checkbox>
            <span class="dup-conf-stats">完全一致 {{ confidenceCounts.high }} · 部分一致 {{ confidenceCounts.medium }}</span>
            <a-space :size="8" class="dup-conf-actions">
              <a-button size="small" @click="selectByConfidence('high')">勾选完全一致</a-button>
              <a-button size="small" @click="selectByConfidence('medium')">勾选部分一致</a-button>
            </a-space>
          </div>
        </a-spin>
      </div>

      <div v-if="groups.length > 0" ref="listScrollRef" class="dup-list">
        <DuplicateGroupCard
          v-for="group in groups"
          :key="group.assetId"
          v-memo="[group.assetId, group.duplicates.length, group.canonical.path, groupSelectionToken(group)]"
          :group="group"
          :selected-paths="selectedPaths"
          @toggle-member="toggleMember"
          @toggle-group="checked => toggleGroupMembers(group, checked)"
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

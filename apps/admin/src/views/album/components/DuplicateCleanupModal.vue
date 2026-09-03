/**
 * 清理重复下载弹窗
 * 职责：按正本分组展示多个可删副本；stem 歧义时提示；默认勾选全部副本
 */
<script setup lang="ts">
import { convertFileSrc } from "@tauri-apps/api/core";
import IconifyIcon from "@/components/IconifyIcon/index.vue";
import { deleteAlbumLocal, findAlbumLocalDuplicates } from "@/api/album";
import LivePhotoBadge from "./LivePhotoBadge.vue";
import { message } from "ant-design-vue";
import type { DuplicateFileSide, DuplicateGroup, DuplicateLegacyItem } from "../types";

const open = defineModel<boolean>("open", { default: false });

const emit = defineEmits<{
  deleted: [];
}>();

defineOptions({ name: "DuplicateCleanupModal" });

const loading = ref(false);
const deleting = ref(false);
const error = ref("");
const groups = ref<DuplicateGroup[]>([]);
const selectedPaths = ref<Set<string>>(new Set());
const activeGroupKeys = ref<string[]>([]);

function duplicatePath(item: DuplicateLegacyItem): string {
  return item.duplicate.path;
}

function groupKey(group: DuplicateGroup): string {
  return group.assetId;
}

function sideLabel(kind: string): string {
  if (kind === "live") return "实况";
  if (kind === "video") return "视频";
  return "照片";
}

const thumbFailed = ref<Set<string>>(new Set());

function thumbKey(side: DuplicateFileSide): string {
  return side.path;
}

function thumbSrc(side: DuplicateFileSide): string | undefined {
  const key = thumbKey(side);
  if (thumbFailed.value.has(key)) return undefined;
  const cached = side.thumbPath?.trim();
  if (cached) return convertFileSrc(cached);
  const ext = side.ext.toLowerCase();
  if (side.path?.trim() && !["heic", "heif"].includes(ext) && !["mp4", "mov", "m4v"].includes(ext)) {
    return convertFileSrc(side.path);
  }
  return undefined;
}

function onThumbError(side: DuplicateFileSide) {
  thumbFailed.value = new Set(thumbFailed.value).add(thumbKey(side));
}

function formatPaths(side: DuplicateFileSide): string[] {
  const lines = [side.path];
  if (side.videoPath?.trim()) lines.push(side.videoPath);
  return lines;
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

async function loadGroups() {
  loading.value = true;
  error.value = "";
  groups.value = [];
  selectedPaths.value = new Set();
  activeGroupKeys.value = [];
  thumbFailed.value = new Set();
  try {
    const result = await findAlbumLocalDuplicates();
    groups.value = result;
    selectedPaths.value = new Set(allDuplicatePaths(result));
    activeGroupKeys.value = result.map(groupKey);
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

function groupAllSelected(group: DuplicateGroup): boolean {
  return group.duplicates.every(item => selectedPaths.value.has(duplicatePath(item)));
}

function groupIndeterminate(group: DuplicateGroup): boolean {
  const selected = group.duplicates.filter(item => selectedPaths.value.has(duplicatePath(item))).length;
  return selected > 0 && selected < group.duplicates.length;
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
    activeGroupKeys.value = groups.value.map(groupKey);
    message.success(`已删除 ${paths.length} 个重复副本`);
    emit("deleted");
  } catch (e: unknown) {
    error.value = typeof e === "string" ? e : "删除失败";
    throw e;
  } finally {
    deleting.value = false;
  }
}

function groupHeaderTitle(group: DuplicateGroup): string {
  const dupCount = group.duplicates.length;
  return `${sideLabel(group.mediaKind)} · ${group.contentKey} · ${dupCount} 个副本`;
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
    <p class="dup-intro">
      按 iCloud 同步正本分组：每组保留左侧 1 份，右侧为可删的旧 icloudpd 或 sync 目录内旧命名副本。同一正本对应多份副本时会折叠在同一组内。
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

      <a-collapse v-if="groups.length > 0" v-model:active-key="activeGroupKeys" class="dup-collapse">
        <a-collapse-panel v-for="group in groups" :key="groupKey(group)">
          <template #header>
            <div class="dup-panel-head">
              <span class="dup-panel-title">{{ groupHeaderTitle(group) }}</span>
              <a-tag v-if="group.ambiguousStem" color="orange" class="dup-ambiguous-tag">stem 歧义</a-tag>
            </div>
          </template>

          <div class="dup-group-body">
            <div class="dup-side dup-keep">
              <div class="dup-side-head">
                <span class="dup-tag dup-tag-keep">保留</span>
                <span>{{ sideLabel(group.mediaKind) }}</span>
              </div>
              <div class="dup-thumb-wrap">
                <LivePhotoBadge v-if="group.mediaKind === 'live'" class="dup-live-badge" size="sm" />
                <img
                  v-if="thumbSrc(group.canonical)"
                  :src="thumbSrc(group.canonical)"
                  alt=""
                  class="dup-thumb"
                  @error="onThumbError(group.canonical)"
                />
                <div v-else class="dup-thumb-placeholder">
                  <IconifyIcon icon="ant-design:file-image-outlined" width="28" height="28" />
                </div>
              </div>
              <div class="dup-paths">
                <div v-for="(line, i) in formatPaths(group.canonical)" :key="i" class="dup-path" :title="line">
                  {{ line }}
                </div>
              </div>
            </div>

            <div class="dup-duplicates">
              <div class="dup-dup-toolbar">
                <a-checkbox
                  :checked="groupAllSelected(group)"
                  :indeterminate="groupIndeterminate(group)"
                  @change="(e: { target: { checked: boolean } }) => toggleGroupDuplicates(group, e.target.checked)"
                >
                  本组副本（{{ group.duplicates.filter(d => selectedPaths.has(duplicatePath(d))).length }} / {{ group.duplicates.length }}）
                </a-checkbox>
              </div>

              <ul class="dup-dup-list">
                <li v-for="(item, idx) in group.duplicates" :key="duplicatePath(item)" class="dup-dup-row">
                  <a-checkbox
                    class="dup-check"
                    :checked="selectedPaths.has(duplicatePath(item))"
                    @change="(e: { target: { checked: boolean } }) => toggleDuplicate(duplicatePath(item), e.target.checked)"
                  />
                  <div class="dup-side dup-delete dup-dup-side">
                    <div class="dup-side-head">
                      <span class="dup-tag dup-tag-delete">删除 {{ idx + 1 }}</span>
                      <a-tag v-if="item.incomplete" color="orange" class="dup-incomplete-tag">
                        {{ item.incompleteNote || "不完整" }}
                      </a-tag>
                    </div>
                    <div class="dup-thumb-wrap">
                      <LivePhotoBadge v-if="group.mediaKind === 'live'" class="dup-live-badge" size="sm" />
                      <img
                        v-if="thumbSrc(item.duplicate)"
                        :src="thumbSrc(item.duplicate)"
                        alt=""
                        class="dup-thumb"
                        @error="onThumbError(item.duplicate)"
                      />
                      <div v-else class="dup-thumb-placeholder">
                        <IconifyIcon icon="ant-design:file-image-outlined" width="28" height="28" />
                      </div>
                    </div>
                    <div class="dup-paths">
                      <div v-for="(line, i) in formatPaths(item.duplicate)" :key="i" class="dup-path" :title="line">
                        {{ line }}
                      </div>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </a-collapse-panel>
      </a-collapse>
    </a-spin>
  </a-modal>
</template>

<style scoped lang="scss">
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

.dup-collapse {
  max-height: min(60vh, 520px);
  overflow-x: hidden;
  overflow-y: auto;
  background: transparent;
  border: none;

  :deep(.ant-collapse-item) {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    margin-bottom: 10px;
    overflow: hidden;
  }

  :deep(.ant-collapse-header) {
    align-items: center !important;
  }

  :deep(.ant-collapse-content-box) {
    overflow-x: hidden;
  }
}

.dup-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dup-panel-title {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dup-ambiguous-tag {
  margin: 0;
  flex-shrink: 0;
  font-size: 11px;
}

.dup-group-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 16px;
  align-items: start;
  min-width: 0;
  overflow-x: hidden;
}

.dup-side {
  min-width: 0;
  overflow-x: hidden;
}

.dup-duplicates {
  min-width: 0;
  overflow-x: hidden;
}

.dup-dup-toolbar {
  margin-bottom: 8px;
}

.dup-dup-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.dup-dup-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 0;
  border-top: 1px dashed var(--border-color);
  min-width: 0;
  overflow-x: hidden;

  &:first-child {
    border-top: none;
    padding-top: 0;
  }
}

.dup-check {
  flex-shrink: 0;
  margin-top: 8px;
}

.dup-dup-side {
  flex: 1;
  min-width: 0;
}

.dup-side-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-wrap: wrap;
}

.dup-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
}

.dup-tag-keep {
  background: rgba(82, 196, 26, 0.12);
  color: #389e0d;
}

.dup-tag-delete {
  background: rgba(255, 77, 79, 0.12);
  color: #cf1322;
}

.dup-incomplete-tag {
  margin: 0;
  font-size: 11px;
}

.dup-thumb-wrap {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-color-secondary, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--border-color);
}

.dup-live-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 1;
}

.dup-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dup-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
}

.dup-paths {
  margin-top: 8px;
  min-width: 0;
  overflow-x: hidden;
}

/** 长路径换行展示；Windows 路径无空格处也可断行，避免弹窗横向滚动 */
.dup-path {
  font-size: 11px;
  color: var(--color-text-tertiary);
  line-height: 1.45;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

@media (max-width: 640px) {
  .dup-group-body {
    grid-template-columns: 1fr;
  }
}
</style>

<style lang="scss">
/** 弹窗层：禁止内容撑出横向滚动条 */
.dup-cleanup-modal-wrap .ant-modal-body {
  overflow-x: hidden;
}
</style>

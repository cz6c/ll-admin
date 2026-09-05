<!--
  重复清理：单组正本 + 多副本
  布局：左右侧栏同构（side-head → thumb → paths），首张副本缩略图与左侧顶对齐
-->
<script setup lang="ts">
import DuplicateLazyThumb from "./DuplicateLazyThumb.vue";
import type { DuplicateGroup, DuplicateLegacyItem, DuplicateMatchConfidence } from "../types";

const props = defineProps<{
  group: DuplicateGroup;
  selectedPaths: ReadonlySet<string>;
}>();

const emit = defineEmits<{
  toggleDuplicate: [path: string, checked: boolean];
  toggleGroup: [checked: boolean];
}>();

defineOptions({ name: "DuplicateGroupCard" });

function duplicatePath(item: DuplicateLegacyItem): string {
  return item.duplicate.path;
}

function sideLabel(kind: string): string {
  if (kind === "live") return "实况";
  if (kind === "video") return "视频";
  return "照片";
}

function formatPaths(path: string, videoPath?: string): string[] {
  const lines = [path];
  if (videoPath?.trim()) lines.push(videoPath);
  return lines;
}

const dupCount = computed(() => props.group.duplicates.length);

const selectedInGroup = computed(
  () => props.group.duplicates.filter(item => props.selectedPaths.has(duplicatePath(item))).length
);

const groupAllSelected = computed(
  () => dupCount.value > 0 && selectedInGroup.value === dupCount.value
);

const groupIndeterminate = computed(
  () => selectedInGroup.value > 0 && selectedInGroup.value < dupCount.value
);

function groupHeaderTitle(): string {
  return `${sideLabel(props.group.mediaKind)} · ${props.group.contentKey} · ${dupCount.value} 个副本`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function confidenceLabel(level: DuplicateMatchConfidence): string {
  if (level === "high") return "高置信";
  if (level === "medium") return "中置信";
  return "低置信";
}

function confidenceColor(level: DuplicateMatchConfidence): string {
  if (level === "high") return "green";
  if (level === "medium") return "blue";
  return "default";
}
</script>

<template>
  <article class="dup-group-card">
    <header class="dup-group-head">
      <span class="dup-group-title">{{ groupHeaderTitle() }}</span>
      <a-tag v-if="group.ambiguousStem" color="orange" class="dup-ambiguous-tag">多正本</a-tag>
      <a-checkbox
        class="dup-group-check"
        :checked="groupAllSelected"
        :indeterminate="groupIndeterminate"
        @change="(e: { target: { checked: boolean } }) => emit('toggleGroup', e.target.checked)"
      >
        本组副本（{{ selectedInGroup }} / {{ dupCount }}）
      </a-checkbox>
    </header>

    <div class="dup-group-body">
      <div class="dup-side dup-keep">
        <div class="dup-side-head">
          <span class="dup-tag dup-tag-keep">保留</span>
          <span>{{ sideLabel(group.mediaKind) }}</span>
        </div>
        <DuplicateLazyThumb :side="group.canonical" :is-live="group.mediaKind === 'live'" />
        <div class="dup-paths">
          <div
            v-for="(line, i) in formatPaths(group.canonical.path, group.canonical.videoPath)"
            :key="i"
            class="dup-path"
            :title="line"
          >
            {{ line }}
          </div>
        </div>
      </div>

      <div class="dup-duplicates">
        <ul class="dup-dup-list">
          <li v-for="(item, idx) in group.duplicates" :key="duplicatePath(item)" class="dup-dup-row">
            <!-- 与左侧同构：head → thumb → paths，避免左侧勾选列把缩略图挤偏 -->
            <div class="dup-side dup-delete">
              <div class="dup-side-head">
                <a-checkbox
                  class="dup-item-check"
                  :checked="selectedPaths.has(duplicatePath(item))"
                  @change="(e: { target: { checked: boolean } }) => emit('toggleDuplicate', duplicatePath(item), e.target.checked)"
                />
                <span class="dup-tag dup-tag-delete">删除 {{ idx + 1 }}</span>
                <a-tag :color="confidenceColor(item.confidence)" class="dup-conf-tag">
                  {{ confidenceLabel(item.confidence) }}
                </a-tag>
                <span class="dup-size-hint">
                  {{ formatBytes(item.canonicalSize) }} → {{ formatBytes(item.duplicateSize) }}
                </span>
                <a-tag v-if="item.incomplete" color="orange" class="dup-incomplete-tag">
                  {{ item.incompleteNote || "不完整" }}
                </a-tag>
              </div>
              <DuplicateLazyThumb :side="item.duplicate" :is-live="group.mediaKind === 'live'" />
              <div class="dup-paths">
                <div
                  v-for="(line, i) in formatPaths(item.duplicate.path, item.duplicate.videoPath)"
                  :key="i"
                  class="dup-path"
                  :title="line"
                >
                  {{ line }}
                </div>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.dup-group-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 10px;
  min-width: 0;
  overflow-x: hidden;
  content-visibility: auto;
  contain-intrinsic-size: auto 320px;
  contain: layout style paint;
}

.dup-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  min-width: 0;
}

.dup-group-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;
  min-width: 0;
}

.dup-ambiguous-tag {
  margin: 0;
  flex-shrink: 0;
  font-size: 11px;
}

.dup-group-check {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
}

.dup-group-body {
  display: grid;
  /* 等宽列，左右缩略图水平起点一致 */
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  min-width: 0;
}

.dup-side {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.dup-duplicates {
  min-width: 0;
}

.dup-dup-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.dup-dup-row {
  min-width: 0;
  padding: 0;

  & + & {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px dashed var(--border-color);
  }
}

.dup-side-head {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 固定一行高度，保证左右 thumb 顶边对齐（标签换行时仍占满 min 高度） */
  min-height: 24px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-wrap: wrap;
}

.dup-item-check {
  flex-shrink: 0;
  margin-inline-end: 0;
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

.dup-conf-tag {
  margin: 0;
  font-size: 11px;
}

.dup-size-hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.dup-paths {
  margin-top: 8px;
  min-width: 0;
}

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

  .dup-group-check {
    margin-left: 0;
    width: 100%;
  }
}
</style>

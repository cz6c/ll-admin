<!--
  重复清理：单组正本 + 多副本；独立组件便于 v-memo 降低勾选时的重绘范围
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
      <a-tag v-if="group.ambiguousStem" color="orange" class="dup-ambiguous-tag">stem 歧义</a-tag>
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
        <div class="dup-dup-toolbar">
          <a-checkbox
            :checked="groupAllSelected"
            :indeterminate="groupIndeterminate"
            @change="(e: { target: { checked: boolean } }) => emit('toggleGroup', e.target.checked)"
          >
            本组副本（{{ selectedInGroup }} / {{ dupCount }}）
          </a-checkbox>
        </div>

        <ul class="dup-dup-list">
          <li v-for="(item, idx) in group.duplicates" :key="duplicatePath(item)" class="dup-dup-row">
            <a-checkbox
              class="dup-check"
              :checked="selectedPaths.has(duplicatePath(item))"
              @change="(e: { target: { checked: boolean } }) => emit('toggleDuplicate', duplicatePath(item), e.target.checked)"
            />
            <div class="dup-side dup-delete dup-dup-side">
              <div class="dup-side-head">
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
}

.dup-side {
  min-width: 0;
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
}
</style>

<!--
  重复清理：单组横向成员条
  职责：建议正本 + 副本同一横滑列表；均可勾选（外层保证每组至少留 1）
-->
<script setup lang="ts">
import DuplicateLazyThumb from "./DuplicateLazyThumb.vue";
import type { DuplicateFileSide, DuplicateGroup, DuplicateLegacyItem, DuplicateMatchConfidence } from "../types";

const props = defineProps<{
  group: DuplicateGroup;
  selectedPaths: ReadonlySet<string>;
}>();

const emit = defineEmits<{
  toggleMember: [path: string, checked: boolean];
  toggleGroup: [checked: boolean];
}>();

defineOptions({ name: "DuplicateGroupCard" });

type RowKind = "canonical" | "duplicate";

interface MemberRow {
  kind: RowKind;
  path: string;
  side: DuplicateFileSide;
  confidence?: DuplicateMatchConfidence;
  incomplete?: boolean;
  incompleteNote?: string;
  /** 该侧主文件字节数 */
  sizeBytes?: number;
}

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function matchLevelLabel(level: DuplicateMatchConfidence): string {
  if (level === "high") return "完全一致";
  return "部分一致";
}

function matchLevelColor(level: DuplicateMatchConfidence): string {
  if (level === "high") return "green";
  return "blue";
}

const memberRows = computed((): MemberRow[] => {
  const canonSize = props.group.duplicates[0]?.canonicalSize;
  const rows: MemberRow[] = [
    {
      kind: "canonical",
      path: props.group.canonical.path,
      side: props.group.canonical,
      sizeBytes: canonSize
    }
  ];
  for (const item of props.group.duplicates) {
    rows.push({
      kind: "duplicate",
      path: duplicatePath(item),
      side: item.duplicate,
      confidence: item.confidence,
      incomplete: item.incomplete,
      incompleteNote: item.incompleteNote,
      sizeBytes: item.duplicateSize
    });
  }
  return rows;
});

const memberCount = computed(() => memberRows.value.length);

/** 本组最大可勾选数 = n-1（至少留 1） */
const maxSelectable = computed(() => Math.max(0, memberCount.value - 1));

const selectedInGroup = computed(
  () => memberRows.value.filter(row => props.selectedPaths.has(row.path)).length
);

const groupAllSelected = computed(
  () => maxSelectable.value > 0 && selectedInGroup.value === maxSelectable.value
);

const groupIndeterminate = computed(
  () => selectedInGroup.value > 0 && selectedInGroup.value < maxSelectable.value
);

function groupHeaderTitle(): string {
  return `${sideLabel(props.group.mediaKind)} · ${props.group.contentKey} · ${memberCount.value} 项`;
}
</script>

<template>
  <article class="dup-group-card">
    <header class="dup-group-head">
      <span class="dup-group-title">{{ groupHeaderTitle() }}</span>
      <a-tag v-if="group.ambiguousStem" color="orange" class="dup-ambiguous-tag">多落库</a-tag>
      <a-checkbox
        class="dup-group-check"
        :checked="groupAllSelected"
        :indeterminate="groupIndeterminate"
        @change="(e: { target: { checked: boolean } }) => emit('toggleGroup', e.target.checked)"
      >
        本组可删（{{ selectedInGroup }} / {{ maxSelectable }}）
      </a-checkbox>
    </header>

    <ul class="dup-member-list">
      <li v-for="row in memberRows" :key="row.path" class="dup-member-row">
        <div class="dup-side">
          <div class="dup-side-head">
            <a-checkbox
              class="dup-item-check"
              :checked="selectedPaths.has(row.path)"
              @change="(e: { target: { checked: boolean } }) => emit('toggleMember', row.path, e.target.checked)"
            />
            <span v-if="row.kind === 'canonical'" class="dup-tag dup-tag-keep">建议保留</span>
            <span v-else class="dup-tag dup-tag-delete">可删</span>
            <span>{{ sideLabel(group.mediaKind) }}</span>
            <a-tag v-if="row.confidence" :color="matchLevelColor(row.confidence)" class="dup-conf-tag">
              {{ matchLevelLabel(row.confidence) }}
            </a-tag>
            <a-tag v-if="row.incomplete" color="orange" class="dup-incomplete-tag">
              {{ row.incompleteNote || "不完整" }}
            </a-tag>
          </div>
          <DuplicateLazyThumb :side="row.side" :is-live="group.mediaKind === 'live'" />
          <div v-if="row.sizeBytes != null" class="dup-size-hint">{{ formatBytes(row.sizeBytes) }}</div>
          <div class="dup-paths">
            <div
              v-for="(line, i) in formatPaths(row.side.path, row.side.videoPath)"
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
  </article>
</template>

<style scoped lang="scss">
.dup-group-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 10px;
  min-width: 0;
  overflow: hidden;
  content-visibility: auto;
  contain-intrinsic-size: auto 300px;
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

/** 同组横向滚动 */
.dup-member-list {
  list-style: none;
  margin: 0;
  padding: 0 0 4px;
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.dup-member-row {
  flex: 0 0 220px;
  width: 220px;
  min-width: 220px;
  max-width: 220px;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--fill-color, rgba(0, 0, 0, 0.02));
}

.dup-side {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.dup-side-head {
  display: flex;
  align-items: center;
  gap: 6px;
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
  margin-top: 6px;
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.dup-paths {
  margin-top: 6px;
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
</style>

/**
 * 清理重复下载弹窗
 * 职责：左右对比 sync 正本 vs legacy 副本，默认勾选删除右侧
 */
<script setup lang="ts">
import { convertFileSrc } from "@tauri-apps/api/core";
import IconifyIcon from "@/components/IconifyIcon/index.vue";
import { deleteAlbumLocal, findAlbumLocalDuplicates } from "@/api/album";
import LivePhotoBadge from "./LivePhotoBadge.vue";
import { message } from "ant-design-vue";
import type { DuplicateFileSide, DuplicatePair } from "../types";

const open = defineModel<boolean>("open", { default: false });

const emit = defineEmits<{
  deleted: [];
}>();

defineOptions({ name: "DuplicateCleanupModal" });

const loading = ref(false);
const deleting = ref(false);
const error = ref("");
const pairs = ref<DuplicatePair[]>([]);
const selectedKeys = ref<Set<string>>(new Set());

function pairKey(pair: DuplicatePair): string {
  return pair.duplicate.path;
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

/** HEIC 等须用 media.db 缓存 WebP；浏览器可直显的 jpg/png 可回退原 path */
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

function formatPaths(side: DuplicatePair["duplicate"]): string[] {
  const lines = [side.path];
  if (side.videoPath?.trim()) lines.push(side.videoPath);
  return lines;
}

async function loadPairs() {
  loading.value = true;
  error.value = "";
  pairs.value = [];
  selectedKeys.value = new Set();
  thumbFailed.value = new Set();
  try {
    const result = await findAlbumLocalDuplicates();
    pairs.value = result;
    selectedKeys.value = new Set(result.map(pairKey));
  } catch (e: unknown) {
    error.value = typeof e === "string" ? e : "扫描重复文件失败";
  } finally {
    loading.value = false;
  }
}

watch(open, val => {
  if (val) void loadPairs();
});

function togglePair(pair: DuplicatePair, checked: boolean) {
  const key = pairKey(pair);
  const next = new Set(selectedKeys.value);
  if (checked) next.add(key);
  else next.delete(key);
  selectedKeys.value = next;
}

function toggleAll(checked: boolean) {
  if (checked) {
    selectedKeys.value = new Set(pairs.value.map(pairKey));
  } else {
    selectedKeys.value = new Set();
  }
}

const allSelected = computed(
  () => pairs.value.length > 0 && selectedKeys.value.size === pairs.value.length
);
const indeterminate = computed(
  () => selectedKeys.value.size > 0 && selectedKeys.value.size < pairs.value.length
);

async function onDeleteSelected() {
  const toDelete = pairs.value.filter(p => selectedKeys.value.has(pairKey(p)));
  if (toDelete.length === 0) return;

  deleting.value = true;
  error.value = "";
  try {
    const paths: string[] = [];
    for (const pair of toDelete) {
      paths.push(pair.duplicate.path);
      if (pair.duplicate.videoPath?.trim()) paths.push(pair.duplicate.videoPath);
    }
    await deleteAlbumLocal(paths);
    pairs.value = pairs.value.filter(p => !selectedKeys.value.has(pairKey(p)));
    selectedKeys.value = new Set();
    message.success(`已删除 ${toDelete.length} 组重复文件`);
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
    :confirm-loading="deleting"
    ok-text="删除所选"
    cancel-text="关闭"
    :ok-button-props="{ disabled: selectedKeys.size === 0, danger: true }"
    @ok="onDeleteSelected"
  >
    <p class="dup-intro">
      左侧为应用 iCloud 同步落盘（保留），右侧为旧 icloudpd 等同内容副本（默认勾选删除）。Live 按一张实况成组匹配。
    </p>

    <a-spin :spinning="loading">
      <a-alert v-if="error" type="error" :message="error" show-icon class="dup-alert" />

      <a-empty v-if="!loading && !error && pairs.length === 0" description="未发现重复下载" />

      <div v-else-if="pairs.length > 0" class="dup-toolbar">
        <a-checkbox :checked="allSelected" :indeterminate="indeterminate" @change="(e: { target: { checked: boolean } }) => toggleAll(e.target.checked)">
          全选右侧（{{ selectedKeys.size }} / {{ pairs.length }}）
        </a-checkbox>
      </div>

      <ul v-if="pairs.length > 0" class="dup-list">
        <li v-for="pair in pairs" :key="pairKey(pair)" class="dup-row">
          <a-checkbox
            class="dup-check"
            :checked="selectedKeys.has(pairKey(pair))"
            @change="(e: { target: { checked: boolean } }) => togglePair(pair, e.target.checked)"
          />
          <div class="dup-cols">
            <div class="dup-side dup-keep">
              <div class="dup-side-head">
                <span class="dup-tag dup-tag-keep">保留</span>
                <span>{{ sideLabel(pair.mediaKind) }}</span>
              </div>
              <div class="dup-thumb-wrap">
                <LivePhotoBadge v-if="pair.mediaKind === 'live'" class="dup-live-badge" size="sm" />
                <img
                  v-if="thumbSrc(pair.canonical)"
                  :src="thumbSrc(pair.canonical)"
                  alt=""
                  class="dup-thumb"
                  @error="onThumbError(pair.canonical)"
                />
                <div v-else class="dup-thumb-placeholder">
                  <IconifyIcon icon="ant-design:file-image-outlined" width="28" height="28" />
                </div>
              </div>
              <div class="dup-paths">
                <div v-for="(line, i) in formatPaths(pair.canonical)" :key="i" class="dup-path" :title="line">
                  {{ line }}
                </div>
              </div>
            </div>

            <div class="dup-arrow">
              <IconifyIcon icon="ant-design:swap-outlined" width="18" height="18" />
            </div>

            <div class="dup-side dup-delete">
              <div class="dup-side-head">
                <span class="dup-tag dup-tag-delete">删除</span>
                <span>{{ sideLabel(pair.mediaKind) }}</span>
                <a-tag v-if="pair.incomplete" color="orange" class="dup-incomplete-tag">
                  {{ pair.incompleteNote || "不完整" }}
                </a-tag>
              </div>
              <div class="dup-thumb-wrap">
                <LivePhotoBadge v-if="pair.mediaKind === 'live'" class="dup-live-badge" size="sm" />
                <img
                  v-if="thumbSrc(pair.duplicate)"
                  :src="thumbSrc(pair.duplicate)"
                  alt=""
                  class="dup-thumb"
                  @error="onThumbError(pair.duplicate)"
                />
                <div v-else class="dup-thumb-placeholder">
                  <IconifyIcon icon="ant-design:file-image-outlined" width="28" height="28" />
                </div>
              </div>
              <div class="dup-paths">
                <div v-for="(line, i) in formatPaths(pair.duplicate)" :key="i" class="dup-path" :title="line">
                  {{ line }}
                </div>
              </div>
            </div>
          </div>
        </li>
      </ul>
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

.dup-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: min(60vh, 520px);
  overflow-y: auto;
}

.dup-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);

  &:last-child {
    border-bottom: none;
  }
}

.dup-check {
  flex-shrink: 0;
  margin-top: 8px;
}

.dup-cols {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: start;
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
}

.dup-path {
  font-size: 11px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dup-arrow {
  align-self: center;
  color: var(--color-text-tertiary);
  padding-top: 28px;
}
</style>

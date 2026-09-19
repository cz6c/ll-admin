<!--
  修改拍摄时间弹窗
  职责：展示勾选传入的媒体；批量设草稿拍摄时间（到秒）；本组件内提交写入并提示成功/失败条数
  适用：本地相册工具栏「修改拍摄时间」。页面只负责打开和传入勾选，不接 confirm
-->
<script setup lang="ts">
import { dateUtil, formatToDatetime } from "@llcz/common";
import type { Dayjs } from "dayjs";
import type { VxeGridInstance, VxeGridProps } from "vxe-table";
import type { VxeGridBindOptions } from "#/vxe-grid";
import { setAlbumCaptureAt, type AlbumSetCaptureAtResult } from "@/api/album";
import AlbumThumbMedia from "./AlbumThumbMedia.vue";
import type { MediaFile } from "../types";

defineOptions({ name: "CaptureAtRewriteModal" });

/** 弹窗内列表可视高度；虚拟滚动固定视口，避免千级分页 */
const GRID_HEIGHT = 400;

const open = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  /** 外层宫格勾选传入的媒体（任意项，含已有拍摄时间）；与宫格共用对象 */
  files: MediaFile[];
}>();

const gridRef = ref<VxeGridInstance<MediaFile>>();
/**
 * 打开时从 props.files 拍下的列表
 * 保存会改 path，页面勾选若按旧 path 丢掉这些项，不能反过来把弹窗列表清空
 */
const sessionFiles = ref<MediaFile[]>([]);
/** path → 草稿拍摄时间（弹窗内，未保存） */
const draftByPath = ref<Record<string, string>>({});
const selectedCount = ref(0);
const targetDay = ref<Dayjs | null>(null);
/** 保存时是否写 EXIF；默认否 */
const writeExif = ref(false);
const submitting = ref(false);
/** 最近一次保存结果；留在弹窗内，关闭或重开时清掉 */
const saveNotice = ref<{ type: "success" | "warning" | "error"; text: string } | null>(null);

const draftedCount = computed(() => Object.keys(draftByPath.value).length);
const canApply = computed(
  () => selectedCount.value > 0 && !!targetDay.value?.isValid() && !submitting.value
);
const canSave = computed(() => draftedCount.value > 0 && !submitting.value);

function formatDirLabel(rel?: string): string {
  const n = (rel ?? ".").trim().replace(/\\/g, "/") || ".";
  return n === "." || n === "" ? "根目录" : n;
}

function formatCaptureLabel(raw?: string): string {
  const s = raw?.trim();
  return s ? formatToDatetime(s) : "—";
}

/**
 * 排序键：草稿拍摄时间优先，否则当前拍摄时间
 * 无法解析或两者都空的沉底，避免没时间的项插进时间线
 */
function rewriteSortKey(file: MediaFile): number | null {
  const raw = (draftByPath.value[file.path] || file.captureAt || "").trim();
  if (!raw) return null;
  const parsed = dateUtil(raw);
  return parsed.isValid() ? parsed.valueOf() : null;
}

function sortedRewriteFiles(files: MediaFile[]): MediaFile[] {
  return [...files].sort((a, b) => {
    const ta = rewriteSortKey(a);
    const tb = rewriteSortKey(b);
    if (ta != null && tb != null) {
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name);
    }
    if (ta != null) return -1;
    if (tb != null) return 1;
    return a.name.localeCompare(b.name);
  });
}

const gridOptions = reactive<VxeGridProps<MediaFile>>({
  height: GRID_HEIGHT,
  showOverflow: true,
  data: [],
  rowConfig: {
    keyField: "path",
    isHover: true
  },
  cellConfig: {
    height: 56
  },
  checkboxConfig: {
    highlight: true
  },
  scrollY: {
    enabled: true,
    gt: 0
  },
  toolbarConfig: {
    enabled: false
  },
  pagerConfig: {
    enabled: false
  },
  columns: [
    {
      type: "checkbox",
      width: 48,
      fixed: "left"
    },
    {
      field: "thumb",
      title: "缩略图",
      width: 72,
      slots: { default: "thumb" }
    },
    {
      field: "relDir",
      title: "目录",
      minWidth: 140,
      showOverflow: true,
      formatter: ({ cellValue }) => formatDirLabel(String(cellValue ?? "."))
    },
    {
      field: "captureAt",
      title: "当前拍摄时间",
      width: 192,
      formatter: ({ row }) => formatCaptureLabel((row as MediaFile).captureAt)
    },
    {
      field: "draft",
      title: "草稿拍摄时间",
      width: 192,
      showOverflow: true,
      slots: { default: "draft" }
    }
  ]
});

function syncSelectedCount() {
  selectedCount.value = gridRef.value?.getCheckboxRecords?.()?.length ?? 0;
}

function syncGridData(checkedRows?: Set<MediaFile>) {
  const checked = checkedRows ?? new Set((gridRef.value?.getCheckboxRecords?.() ?? []) as MediaFile[]);
  const data = sortedRewriteFiles(sessionFiles.value);
  gridOptions.data = data;
  nextTick(() => {
    const rows = data.filter(row => checked.has(row));
    if (rows.length) gridRef.value?.setCheckboxRow?.(rows, true);
    else gridRef.value?.clearCheckboxRow?.();
    syncSelectedCount();
  });
}

function resetState() {
  sessionFiles.value = [...props.files];
  draftByPath.value = {};
  selectedCount.value = 0;
  targetDay.value = dateUtil();
  writeExif.value = false;
  submitting.value = false;
  saveNotice.value = null;
  syncGridData();
}

watch(open, v => {
  if (!v) return;
  resetState();
});

/** 将日期时间应用到勾选行（仅草稿）；入库格式与文件名解析一致，含秒 */
function applyToSelected() {
  if (!canApply.value || !targetDay.value) return;
  const rows = (gridRef.value?.getCheckboxRecords?.() ?? []) as MediaFile[];
  if (!rows.length) return;
  const captureAt = targetDay.value.format("YYYY-MM-DDTHH:mm:ss");
  const next = { ...draftByPath.value };
  for (const row of rows) {
    next[row.path] = captureAt;
  }
  draftByPath.value = next;
  syncGridData();
}

function draftLabel(path: string): string {
  const raw = draftByPath.value[path];
  return raw ? formatToDatetime(raw) : "未设置";
}

function onCancel() {
  open.value = false;
}

function saveResultText(result: AlbumSetCaptureAtResult, wroteExif: boolean): string {
  const parts = [`成功 ${result.updated}；失败 ${result.rejected}`];
  if (result.renames?.length) parts.push(`改名 ${result.renames.length}`);
  if (wroteExif) {
    parts.push(`EXIF 写入 ${result.exifWritten}`);
    if (result.exifFailed) parts.push(`EXIF 失败 ${result.exifFailed}`);
  }
  return parts.join(" · ");
}

/**
 * 写回宫格上的同一批对象，页面不必再接保存结果
 * 改名后 path/name 必须一起换，否则缩略图事件和宫格 key 仍指向旧文件
 */
function applySavedLocally(
  items: { path: string; captureAt: string }[],
  result: AlbumSetCaptureAtResult
) {
  const byPath = new Map(sessionFiles.value.map(file => [file.path, file]));
  const renameMap = new Map((result.renames ?? []).map(row => [row.from, row.to]));
  for (const item of items) {
    const target = byPath.get(item.path);
    if (!target) continue;
    target.captureAt = item.captureAt;
    target.captureAtSource = "user";
    target.captureAtProbed = true;
    if (target.videoPath && renameMap.has(target.videoPath)) {
      target.videoPath = renameMap.get(target.videoPath);
    }
    const to = renameMap.get(item.path);
    if (to && to !== item.path) {
      target.path = to;
      const base = to.replace(/\\/g, "/").split("/").pop();
      if (base) target.name = base;
    }
  }
}

/** 提交草稿：请求、回写、条数提示都在弹窗内完成 */
async function onSave() {
  if (!canSave.value) return;
  const items = Object.entries(draftByPath.value).map(([path, captureAt]) => ({ path, captureAt }));
  const wroteExif = writeExif.value;
  const checked = new Set((gridRef.value?.getCheckboxRecords?.() ?? []) as MediaFile[]);
  submitting.value = true;
  saveNotice.value = null;
  try {
    const result = await setAlbumCaptureAt({ items, writeExif: wroteExif });
    applySavedLocally(items, result);
    draftByPath.value = {};
    saveNotice.value = {
      type: result.rejected > 0 ? "warning" : "success",
      text: saveResultText(result, wroteExif)
    };
    syncGridData(checked);
  } catch (e) {
    saveNotice.value = {
      type: "error",
      text: e instanceof Error ? e.message : String(e) || "保存失败"
    };
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <a-modal
    v-model:open="open"
    title="修改拍摄时间"
    width="960px"
    class="capture-at-rewrite-modal"
    :confirm-loading="submitting"
    destroy-on-close
    @cancel="onCancel"
  >
    <div class="modal-body">
      <p class="hint">
        共 <strong>{{ sessionFiles.length }}</strong> 项。勾选后设时间只改本弹窗草稿；保存时写入相册库，并更新同步风格文件名前缀。EXIF 仅在勾选时写入。
      </p>
      <a-alert v-if="saveNotice" :type="saveNotice.type" :message="saveNotice.text" show-icon />

      <div class="apply-bar">
        <span class="bar-label">设草稿</span>
        <a-date-picker
          v-model:value="targetDay"
          :show-time="{ format: 'HH:mm:ss' }"
          format="YYYY-MM-DD HH:mm:ss"
          allow-clear
          placeholder="目标时间"
          class="apply-date"
        />
        <a-button type="primary" :disabled="!canApply" @click="applyToSelected">
          应用到所选{{ selectedCount ? ` (${selectedCount})` : "" }}
        </a-button>
        <span class="apply-meta">
          已选 {{ selectedCount }} · 已设草稿 {{ draftedCount }}
        </span>
      </div>

      <div class="grid-shell">
        <vxe-grid
          ref="gridRef"
          class="candidate-grid"
          v-bind="gridOptions as VxeGridBindOptions"
          @checkbox-change="syncSelectedCount"
          @checkbox-all="syncSelectedCount"
        >
          <template #thumb="{ row }">
            <div class="row-thumb" :title="(row as MediaFile).name">
              <AlbumThumbMedia :file="row as MediaFile" size="sm" />
            </div>
          </template>
          <template #draft="{ row }">
            <span :class="draftByPath[(row as MediaFile).path] ? 'draft-set' : 'draft-empty'">
              {{ draftLabel((row as MediaFile).path) }}
            </span>
          </template>
        </vxe-grid>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <a-checkbox v-model:checked="writeExif" class="exif-check">
          保存时同步写入 EXIF（JPEG / PNG / WebP，按文件内容识别）
        </a-checkbox>
        <a-space>
          <a-button @click="onCancel">取消</a-button>
          <a-button type="primary" :disabled="!canSave" :loading="submitting" @click="onSave">
            保存{{ draftedCount ? ` (${draftedCount})` : "" }}
          </a-button>
        </a-space>
      </div>
    </template>
  </a-modal>
</template>

<style scoped lang="scss">
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.apply-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.bar-label {
  flex: 0 0 auto;
  width: 40px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-tertiary);
}

.apply-date {
  width: 208px;
}

.apply-meta {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
}

.grid-shell {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-color);
}

.candidate-grid {
  :deep(.vxe-table--body-wrapper) {
    background: transparent;
  }
}

.row-thumb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: 0 auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--fill-color, rgba(0, 0, 0, 0.04));
  overflow: hidden;
}

.draft-set {
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}

.draft-empty {
  color: var(--color-text-tertiary);
}

.modal-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.exif-check {
  margin-inline-end: auto;
}
</style>

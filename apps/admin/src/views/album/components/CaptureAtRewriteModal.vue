<!--
  修改拍摄时间弹窗
  职责：按拖拽顺序，用起始时间 + 间隔生成每张拍摄时间；单行可手改且不带动其余行；提交后轻提示，全部成功关弹窗
  适用：本地相册给老照片补拍摄时间。页面只负责打开、传入勾选，以及在 saved 后清勾选；不接 confirm
  备注：列表用 SortableJS（forceFallback）。Modal destroy-on-close 时 open 当下 listEl 常为空，须重试/待 ref 出现后再挂载；antdv 无 afterOpenChange
-->
<script setup lang="ts">
import { dateUtil, formatToDatetime } from "@llcz/common";
import type { Dayjs } from "dayjs";
import type Sortable from "sortablejs";
import { setAlbumCaptureAt, type AlbumSetCaptureAtResult } from "@/api/album";
import IconifyIcon from "@/components/IconifyIcon/index.vue";
import $feedback from "@/utils/feedback";
import AlbumThumbMedia from "./AlbumThumbMedia.vue";
import type { MediaFile } from "../types";

defineOptions({ name: "CaptureAtRewriteModal" });

/** 弹窗内列表可视高度 */
const LIST_HEIGHT = 400;

/**
 * 顺序间隔。默认 1 秒：补完仍落在同一天，相册按拍摄时间排序即可稳住自定义顺序。
 * 用日历单位而不是固定秒数，「1 天」才不会在夏令时变成 23/25 小时。
 */
const STEP_OPTIONS = [
  { label: "1 秒", value: "second" },
  { label: "1 分", value: "minute" },
  { label: "1 小时", value: "hour" },
  { label: "1 天", value: "day" }
] as const;

type StepUnit = (typeof STEP_OPTIONS)[number]["value"];

/** 日期控件与 @llcz/common 各带一份 dayjs，运行时对象兼容，只在交给控件时断言 */
function asPickerDay(value: ReturnType<typeof dateUtil>): Dayjs {
  return value as unknown as Dayjs;
}

const open = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  /** 外层宫格勾选传入的媒体（任意项，含已有拍摄时间）；与宫格共用对象，顺序即打开时的宫格顺序 */
  files: MediaFile[];
}>();

/** 全部写入成功并关弹窗；父页据此清勾选 */
const emit = defineEmits<{
  saved: [];
}>();

/**
 * 打开时从 props.files 拍下的列表，拖拽后即目标顺序
 * 保存会改 path，页面勾选若按旧 path 丢掉这些项，不能反过来把弹窗列表清空
 */
const sessionFiles = ref<MediaFile[]>([]);
/** path → 手改拍摄时间；未出现的行跟随起始时间 + 间隔 */
const overrideByPath = ref<Record<string, string>>({});
/** 第 1 张的拍摄时间；默认当天 0 点，避免用「现在」把老照片戳进当前时分秒 */
const startAt = ref<Dayjs | null>(null);
const stepUnit = ref<StepUnit>("second");
/** 保存时是否写 EXIF；默认否 */
const writeExif = ref(false);
const submitting = ref(false);

const listEl = ref<HTMLElement | null>(null);
let sortable: Sortable | null = null;
/** 避免 open 与 listEl 两侧重复挂载打架 */
let mountToken = 0;

const overrideCount = computed(() => Object.keys(overrideByPath.value).length);

function formatDirLabel(rel?: string): string {
  const n = (rel ?? ".").trim().replace(/\\/g, "/") || ".";
  return n === "." || n === "" ? "根目录" : n;
}

function formatCaptureLabel(raw?: string): string {
  const s = raw?.trim();
  return s ? formatToDatetime(s) : "—";
}

/** 当前拖拽顺序中的下标；用 path 查，避免 DOM 行号把间隔算错 */
function orderIndex(path: string): number {
  const index = sessionFiles.value.findIndex(file => file.path === path);
  return index < 0 ? 0 : index;
}

/**
 * 按列表下标计算跟随顺序的拍摄时间（不含手改）
 * @param index 当前拖拽顺序中的下标，0 为起始时间
 */
function sequenceCaptureAt(index: number): string | null {
  if (!startAt.value?.isValid()) return null;
  return startAt.value.add(index, stepUnit.value).format("YYYY-MM-DDTHH:mm:ss");
}

/** 实际将写入的时间：手改优先，否则跟随顺序 */
function rowCaptureAt(path: string): string | null {
  return overrideByPath.value[path] || sequenceCaptureAt(orderIndex(path));
}

function draftDay(path: string): Dayjs | null {
  const raw = rowCaptureAt(path);
  if (!raw) return null;
  const parsed = dateUtil(raw);
  return parsed.isValid() ? asPickerDay(parsed) : null;
}

const canSave = computed(() => {
  if (submitting.value || sessionFiles.value.length === 0) return false;
  return sessionFiles.value.every(file => !!rowCaptureAt(file.path));
});

function moveRow(from: number, to: number) {
  if (from === to || from < 0 || to < 0) return;
  if (from >= sessionFiles.value.length || to >= sessionFiles.value.length) return;
  const list = sessionFiles.value.slice();
  const [moved] = list.splice(from, 1);
  if (!moved) return;
  list.splice(to, 0, moved);
  sessionFiles.value = list;
}

/**
 * Sortable 已挪过 DOM；按 old/newIndex 改 sessionFiles，让 Vue 按 path key 对齐，避免和 DOM 打架。
 */
function onSortEnd(evt: { oldIndex?: number | null; newIndex?: number | null }) {
  const from = evt.oldIndex;
  const to = evt.newIndex;
  if (from == null || to == null || from === to) return;
  moveRow(from, to);
}

function destroySortable() {
  sortable?.destroy();
  sortable = null;
}

/**
 * Modal 用 destroy-on-close + teleport，open=true 当下 listEl 常还是 null。
 * antdv 也没有 afterOpenChange，只能短重试等 DOM 进文档，避免静默没挂上。
 */
async function mountSortable() {
  const token = ++mountToken;
  destroySortable();
  for (let i = 0; i < 12; i++) {
    if (token !== mountToken || !open.value) return;
    await nextTick();
    if (listEl.value) break;
    await new Promise<void>(resolve => {
      window.setTimeout(resolve, 50);
    });
  }
  if (token !== mountToken || !open.value) return;
  const el = listEl.value;
  if (!el) return;

  const SortableCtor = (await import("sortablejs")).default;
  if (token !== mountToken || !open.value || listEl.value !== el) return;

  sortable = SortableCtor.create(el, {
    animation: 150,
    handle: ".drag-handle",
    draggable: ".order-row",
    // WebView / Modal 里原生 HTML5 DnD 经常失效，强制用 pointer 回退
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 3,
    // 日期控件不要当成拖动手势起点；手柄本身可拖
    filter: ".draft-picker, .row-thumb, .row-nudge, .ant-picker, input",
    preventOnFilter: false,
    onEnd: onSortEnd
  });
}

function resetState() {
  sessionFiles.value = [...props.files];
  overrideByPath.value = {};
  startAt.value = asPickerDay(dateUtil().startOf("day"));
  stepUnit.value = "second";
  writeExif.value = false;
  submitting.value = false;
}

watch(open, v => {
  if (!v) {
    mountToken += 1;
    destroySortable();
    return;
  }
  resetState();
  void mountSortable();
});

/** listEl 晚于 open 出现时补挂，避免只靠定时重试仍错过 */
watch(listEl, el => {
  if (!el || !open.value || sortable) return;
  void mountSortable();
});

onBeforeUnmount(() => {
  mountToken += 1;
  destroySortable();
});

/**
 * 改名后把手改记录改挂到新 path。
 * 不在保存成功后清掉手改，否则「将写入」会跳回纯间隔，和刚落库的时间对不上。
 */
function remapOverrides(renames: { from: string; to: string }[]) {
  if (!renames.length) return;
  const next = { ...overrideByPath.value };
  let changed = false;
  for (const row of renames) {
    if (!next[row.from] || row.to === row.from) continue;
    next[row.to] = next[row.from];
    delete next[row.from];
    changed = true;
  }
  if (changed) overrideByPath.value = next;
}

function clearOverride(path: string) {
  if (!overrideByPath.value[path]) return;
  const next = { ...overrideByPath.value };
  delete next[path];
  overrideByPath.value = next;
}

/**
 * 手改一行。改回与当前顺序相同的时刻则取消手改，改起始时间时该行会继续跟着走。
 */
function onDraftChange(path: string, value: Dayjs | string | null) {
  if (!value) {
    clearOverride(path);
    return;
  }
  const parsed = dateUtil(value as unknown as Parameters<typeof dateUtil>[0]);
  if (!parsed.isValid()) {
    clearOverride(path);
    return;
  }
  const next = parsed.format("YYYY-MM-DDTHH:mm:ss");
  if (next === sequenceCaptureAt(orderIndex(path))) {
    clearOverride(path);
    return;
  }
  overrideByPath.value = { ...overrideByPath.value, [path]: next };
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
function applySavedLocally(items: { path: string; captureAt: string }[], result: AlbumSetCaptureAtResult) {
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

/** 按当前顺序提交；结果走轻提示；全部成功则关弹窗，有失败则留在弹窗可继续改 */
async function onSave() {
  if (!canSave.value) return;
  const items = sessionFiles.value.flatMap(file => {
    const captureAt = rowCaptureAt(file.path);
    return captureAt ? [{ path: file.path, captureAt }] : [];
  });
  if (!items.length) return;
  const wroteExif = writeExif.value;
  submitting.value = true;
  try {
    const result = await setAlbumCaptureAt({ items, writeExif: wroteExif });
    applySavedLocally(items, result);
    remapOverrides(result.renames ?? []);
    const text = saveResultText(result, wroteExif);
    if (result.rejected > 0) {
      $feedback.message.warning(text);
      return;
    }
    $feedback.message.success(text);
    open.value = false;
    emit("saved");
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "保存失败");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <a-modal
    v-model:open="open"
    title="修改拍摄时间"
    width="1040px"
    class="capture-at-rewrite-modal"
    :confirm-loading="submitting"
    destroy-on-close
    @cancel="onCancel"
  >
    <div class="modal-body">
      <p class="hint">
        共 <strong>{{ sessionFiles.length }}</strong> 项。拖左侧手柄排顺序，也可用上下箭头微调；第 1
        张用起始时间，之后每张加一个间隔。手改某一行不会带动其它行，清空该行则重新跟随顺序。保存时写入相册库，并更新同步风格文件名前缀。EXIF 仅在勾选时写入。
      </p>

      <div class="apply-bar">
        <span class="bar-label">起始</span>
        <a-date-picker
          v-model:value="startAt"
          :show-time="{ format: 'HH:mm:ss' }"
          format="YYYY-MM-DD HH:mm:ss"
          :allow-clear="false"
          :disabled="submitting"
          placeholder="起始时间"
          class="apply-date"
        />
        <span class="bar-label">间隔</span>
        <a-segmented v-model:value="stepUnit" :options="[...STEP_OPTIONS]" :disabled="submitting" />
        <span class="apply-meta"> {{ sessionFiles.length }} 张{{ overrideCount ? ` · 手改 ${overrideCount}` : "" }} </span>
      </div>

      <div class="list-shell">
        <div class="list-head">
          <span class="col-handle" />
          <span class="col-seq">顺序</span>
          <span class="col-nudge" />
          <span class="col-thumb">缩略图</span>
          <span class="col-name">文件</span>
          <span class="col-dir">目录</span>
          <span class="col-current">当前拍摄时间</span>
          <span class="col-draft">将写入</span>
        </div>
        <div v-if="!sessionFiles.length" class="list-empty">没有可修改的项</div>
        <div v-else ref="listEl" class="order-list" :style="{ height: `${LIST_HEIGHT}px` }">
          <div v-for="(file, index) in sessionFiles" :key="file.path" class="order-row" :data-path="file.path">
            <span class="drag-handle" title="拖动调整顺序" aria-label="拖动调整顺序">
              <IconifyIcon icon="ant-design:holder-outlined" width="16px" height="16px" />
            </span>
            <span class="col-seq">{{ index + 1 }}</span>
            <div class="row-nudge">
              <button type="button" class="nudge-btn" :disabled="submitting || index === 0" title="上移" aria-label="上移" @click="moveRow(index, index - 1)">
                <IconifyIcon icon="ant-design:up-outlined" width="12px" height="12px" />
              </button>
              <button
                type="button"
                class="nudge-btn"
                :disabled="submitting || index === sessionFiles.length - 1"
                title="下移"
                aria-label="下移"
                @click="moveRow(index, index + 1)"
              >
                <IconifyIcon icon="ant-design:down-outlined" width="12px" height="12px" />
              </button>
            </div>
            <div class="row-thumb" :title="file.name">
              <AlbumThumbMedia :file="file" size="sm" />
            </div>
            <span class="col-name" :title="file.name">{{ file.name }}</span>
            <span class="col-dir" :title="formatDirLabel(file.relDir)">{{ formatDirLabel(file.relDir) }}</span>
            <span class="col-current">{{ formatCaptureLabel(file.captureAt) }}</span>
            <div class="col-draft">
              <a-date-picker
                :value="draftDay(file.path)"
                :show-time="{ format: 'HH:mm:ss' }"
                format="YYYY-MM-DD HH:mm:ss"
                size="small"
                allow-clear
                :disabled="submitting"
                class="draft-picker"
                @change="value => onDraftChange(file.path, value as Dayjs | string | null)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <a-checkbox v-model:checked="writeExif" class="exif-check" :disabled="submitting">
          保存时同步写入 EXIF（JPEG / PNG / WebP，按文件内容识别）
        </a-checkbox>
        <a-space>
          <a-button @click="onCancel">取消</a-button>
          <a-button type="primary" :disabled="!canSave" :loading="submitting" @click="onSave">
            保存{{ sessionFiles.length ? ` (${sessionFiles.length})` : "" }}
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
  gap: 16px;
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

.list-shell {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-color);
}

.list-head,
.order-row {
  display: grid;
  grid-template-columns: 32px 40px 28px 80px minmax(120px, 1.2fr) minmax(96px, 1fr) 168px 220px;
  gap: 8px;
  align-items: center;
  padding: 0 12px;
}

.list-head {
  height: 40px;
  border-bottom: 1px solid var(--border-color);
  background: var(--fill-color, rgba(255, 255, 255, 0.06));
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.order-list {
  overflow: auto;
}

.order-row {
  min-height: 96px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color);

  &:last-child {
    border-bottom: 0;
  }

  &.sortable-ghost {
    opacity: 0.45;
  }

  &.sortable-chosen {
    background: var(--fill-color, rgba(255, 255, 255, 0.08));
  }
}

.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--color-text-tertiary);
  cursor: grab;
  touch-action: none;
  user-select: none;

  &:hover {
    color: var(--color-text-secondary);
    background: var(--fill-color, rgba(255, 255, 255, 0.08));
  }

  &:active {
    cursor: grabbing;
  }
}

.row-nudge {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
}

.nudge-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 16px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--color-text-secondary);
    background: var(--fill-color, rgba(255, 255, 255, 0.08));
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }
}

.col-seq,
.col-current {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
}

.col-name,
.col-dir {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-thumb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--fill-color, rgba(255, 255, 255, 0.08));
  overflow: hidden;
}

.draft-picker {
  width: 100%;
}

.list-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.modal-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.exif-check {
  margin-inline-end: auto;
}

:global(.sortable-fallback) {
  opacity: 0.92;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
</style>

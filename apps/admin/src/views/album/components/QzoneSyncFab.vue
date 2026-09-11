<!--
  QQ 空间同步浮动入口（第二备份源）
  职责：扫码登录、左相册/右缩略图浏览、灯箱预览、全部/本相册下载
  适用：相册页与 IcloudSyncFab 并列；交互结构参考开源客户端，不嵌入 GPL 源码
  @note 进度区对齐 IcloudSyncStatusCard：顶栏状态卡 + 进度条统计；账号放抽屉 #extra
-->
<script setup lang="ts">
import {
  cancelQzoneSyncJob,
  getQzoneAuthState,
  getQzoneJobStatus,
  listQzoneAlbums,
  listQzonePhotos,
  logoutQzone,
  pauseQzoneSyncJob,
  pollQzoneQrLogin,
  prepareQzonePreview,
  qzoneProxiedSrc,
  resumeQzoneSyncJob,
  startQzoneQrLogin,
  startQzoneSyncJob,
  type QzoneAlbumSummary,
  type QzoneJobSnapshot,
  type QzonePhotoView,
  type QzoneQrStatus
} from "@/api/qzoneSync";
import QzoneLazyImg from "./QzoneLazyImg.vue";
import $feedback from "@/utils/feedback";
import { isTauri } from "@/utils/tauri";
import { useDraggable, useEventListener } from "@vueuse/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import dayjs from "dayjs";

defineOptions({ name: "AlbumQzoneSyncFab" });

const UNKNOWN_DAY = "__unknown__";

const drawerOpen = ref(false);
const loggedIn = ref(false);
const uin = ref("");

const qrImage = ref("");
const qrLoading = ref(false);
const qrStatus = ref<QzoneQrStatus | "idle">("idle");
const qrMessage = ref("");
let qrPollTimer: ReturnType<typeof setInterval> | undefined;

const albums = ref<QzoneAlbumSummary[]>([]);
const albumsLoading = ref(false);
const refreshingCatalog = ref(false);
const albumPaneRef = ref<HTMLElement | null>(null);
const activeAlbumId = ref("");
const photos = ref<QzonePhotoView[]>([]);
const photosLoading = ref(false);
const photoScrollRef = ref<HTMLElement | null>(null);

const previewOpen = ref(false);
const previewIndex = ref(0);
const previewIsVideo = ref(false);
const previewLoading = ref(false);
/** 视频落盘后的 asset URL；图片仍走 qzoneProxiedSrc */
const previewVideoSrc = ref("");
let previewEpoch = 0;

const job = ref<QzoneJobSnapshot>({
  status: "idle",
  phase: "idle",
  done: 0,
  total: 0,
  message: "",
  updated: 0,
  skipped: 0,
  failed: 0
});

const busy = computed(() => ["cataloging", "downloading", "paused"].includes(job.value.status));
const percent = computed(() => {
  if (job.value.total <= 0) return 0;
  return Math.min(100, Math.round((job.value.done / job.value.total) * 100));
});

const statusHeadline = computed(() => {
  switch (job.value.status) {
    case "cataloging":
      return "正在枚举相册…";
    case "downloading":
      return "正在下载到本地";
    case "paused":
      return "已暂停";
    case "failed":
      return "同步失败";
    case "done":
      return "本轮已完成";
    default:
      return "准备就绪";
  }
});

const statusDescription = computed(() => {
  if (job.value.message?.trim()) return job.value.message;
  if (!busy.value) return "可全部下载，或先选相册下载当前相册；下载中可暂停/取消";
  return "";
});

const progressStatsText = computed(() => {
  const j = job.value;
  if (j.total <= 0) return "";
  return `${j.total} · 完成 ${j.done} · 新增 ${j.updated} · 跳过 ${j.skipped} · 失败 ${j.failed}`;
});

const showProgressBar = computed(() => busy.value || job.value.total > 0);

const activeAlbum = computed(() => albums.value.find(a => a.topicId === activeAlbumId.value));

const previewImageSrc = computed(() => {
  if (previewIsVideo.value) return "";
  const photo = photos.value[previewIndex.value];
  if (!photo) return "";
  return qzoneProxiedSrc(photo.previewUrl || photo.thumbUrl, "preview");
});

/** 按日分组时间轴；无时间归「未知时间」并沉底 */
const photoGroups = computed(() => {
  type Row = { photo: QzonePhotoView; index: number };
  const buckets = new Map<string, { key: string; label: string; sort: number; items: Row[] }>();
  photos.value.forEach((photo, index) => {
    const parsed = parseCaptureDay(photo.captureAt);
    const key = parsed?.key ?? UNKNOWN_DAY;
    const label = parsed?.label ?? "未知时间";
    const sort = parsed?.sort ?? -1;
    let g = buckets.get(key);
    if (!g) {
      g = { key, label, sort, items: [] };
      buckets.set(key, g);
    }
    g.items.push({ photo, index });
  });
  return [...buckets.values()].sort((a, b) => b.sort - a.sort);
});

function parseCaptureDay(raw?: string | null): { key: string; label: string; sort: number } | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  let d = dayjs(s);
  if (!d.isValid() && /^\d+$/.test(s)) {
    const n = Number(s);
    d = dayjs(n > 1e12 ? n : n * 1000);
  }
  if (!d.isValid()) return null;
  const key = d.format("YYYY-MM-DD");
  return { key, label: d.format("YYYY年M月D日"), sort: d.startOf("day").valueOf() };
}

async function refreshAuth() {
  const s = await getQzoneAuthState();
  loggedIn.value = !!s.loggedIn;
  uin.value = s.uin || "";
}

async function refreshJob() {
  job.value = await getQzoneJobStatus();
}

async function loadAlbums() {
  albumsLoading.value = true;
  try {
    albums.value = await listQzoneAlbums();
    if (!activeAlbumId.value && albums.value.length) {
      await selectAlbum(albums.value[0].topicId);
    } else if (activeAlbumId.value && !albums.value.some(a => a.topicId === activeAlbumId.value)) {
      activeAlbumId.value = "";
      photos.value = [];
      if (albums.value.length) await selectAlbum(albums.value[0].topicId);
    } else if (activeAlbumId.value) {
      await selectAlbum(activeAlbumId.value, true);
    }
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "拉取相册失败");
  } finally {
    albumsLoading.value = false;
  }
}

/** 刷新远端相册目录与当前相册内容（不启动下载任务） */
async function onRefreshCatalog() {
  if (!loggedIn.value || refreshingCatalog.value) return;
  refreshingCatalog.value = true;
  try {
    await loadAlbums();
    $feedback.message.success("目录已刷新");
  } finally {
    refreshingCatalog.value = false;
  }
}

async function selectAlbum(topicId: string, force = false) {
  if (!topicId) return;
  if (!force && activeAlbumId.value === topicId && photos.value.length) return;
  activeAlbumId.value = topicId;
  photosLoading.value = true;
  photos.value = [];
  try {
    photos.value = await listQzonePhotos(topicId);
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "拉取相片失败");
  } finally {
    photosLoading.value = false;
  }
}

async function openPreview(index: number) {
  const photo = photos.value[index];
  if (!photo) return;
  const epoch = ++previewEpoch;
  previewIndex.value = index;
  previewIsVideo.value = photo.mediaKind === "video";
  previewVideoSrc.value = "";
  previewOpen.value = true;

  if (photo.mediaKind !== "video") {
    previewLoading.value = false;
    return;
  }

  const albumId = photo.albumId || activeAlbumId.value;
  const remote = photo.downloadUrl || photo.previewUrl || "";
  if (!albumId && !remote) {
    $feedback.message.error("无视频地址");
    previewOpen.value = false;
    return;
  }

  previewLoading.value = true;
  try {
    const localPath = await prepareQzonePreview({
      url: remote,
      albumId,
      assetId: photo.assetId,
      mediaKind: "video"
    });
    if (epoch !== previewEpoch) return;
    previewVideoSrc.value = convertFileSrc(localPath);
  } catch (e) {
    if (epoch !== previewEpoch) return;
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "视频预览失败");
    previewOpen.value = false;
  } finally {
    if (epoch === previewEpoch) previewLoading.value = false;
  }
}

function previewNav(delta: number) {
  if (!photos.value.length) return;
  const next = (previewIndex.value + delta + photos.value.length) % photos.value.length;
  void openPreview(next);
}

function stopQrPoll() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = undefined;
  }
}

async function refreshQr() {
  if (!isTauri()) return;
  qrLoading.value = true;
  qrMessage.value = "";
  qrStatus.value = "idle";
  stopQrPoll();
  try {
    const start = await startQzoneQrLogin();
    qrImage.value = start.imageDataUrl;
    qrStatus.value = "waiting";
    qrMessage.value = "请使用手机 QQ 扫码";
    qrPollTimer = setInterval(() => {
      void tickQrPoll();
    }, 2000);
  } catch (e) {
    qrImage.value = "";
    qrStatus.value = "error";
    qrMessage.value = e instanceof Error ? e.message : String(e) || "获取二维码失败";
  } finally {
    qrLoading.value = false;
  }
}

async function tickQrPoll() {
  try {
    const r = await pollQzoneQrLogin();
    qrStatus.value = r.status;
    qrMessage.value = r.message;
    if (r.status === "success") {
      stopQrPoll();
      loggedIn.value = true;
      uin.value = r.auth?.uin || "";
      $feedback.message.success(r.message || `已登录 QQ ${uin.value}`);
      void loadAlbums();
    } else if (r.status === "expired" || r.status === "error") {
      stopQrPoll();
      if (r.message.includes("p_skey")) {
        window.setTimeout(() => {
          void refreshQr();
        }, 800);
      }
    }
  } catch (e) {
    stopQrPoll();
    qrStatus.value = "error";
    qrMessage.value = e instanceof Error ? e.message : String(e) || "轮询失败";
  }
}

async function onLogout() {
  try {
    await logoutQzone();
    loggedIn.value = false;
    uin.value = "";
    albums.value = [];
    photos.value = [];
    activeAlbumId.value = "";
    await refreshJob();
    if (drawerOpen.value) void refreshQr();
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "退出失败");
  }
}

async function onSyncAll() {
  try {
    job.value = await startQzoneSyncJob(null);
    $feedback.message.success("已开始全部下载");
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "启动失败");
  }
}

async function onSyncAlbum() {
  if (!activeAlbumId.value) {
    $feedback.message.warning("请先选择相册");
    return;
  }
  try {
    job.value = await startQzoneSyncJob(activeAlbumId.value);
    $feedback.message.success(`已开始下载：${activeAlbum.value?.name || "本相册"}`);
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "启动失败");
  }
}

async function onPause() {
  try {
    job.value = await pauseQzoneSyncJob();
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "暂停失败");
  }
}

async function onResume() {
  try {
    job.value = await resumeQzoneSyncJob();
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "继续失败");
  }
}

async function onCancel() {
  try {
    job.value = await cancelQzoneSyncJob();
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "取消失败");
  }
}

/** FAB 拖动：默认左下，避开 iCloud 右下球与 CS 顶栏 */
const FAB_POS_KEY = "album.qzoneSyncFab.pos";
const FAB_SIZE = 58;
const EDGE = 8;

function csBarH() {
  if (typeof document === "undefined") return 0;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cs-shell-bar-height")) || 0;
}

function clampPos(x: number, y: number) {
  const minY = csBarH() + EDGE;
  const maxX = Math.max(EDGE, window.innerWidth - FAB_SIZE - EDGE);
  const maxY = Math.max(minY, window.innerHeight - FAB_SIZE - EDGE);
  return {
    x: Math.min(Math.max(EDGE, x), maxX),
    y: Math.min(Math.max(minY, y), maxY)
  };
}

function defaultPos() {
  return clampPos(24, window.innerHeight - FAB_SIZE - 24);
}

function readPos() {
  try {
    const raw = localStorage.getItem(FAB_POS_KEY);
    if (!raw) return defaultPos();
    const p = JSON.parse(raw) as { x?: number; y?: number };
    if (typeof p.x !== "number" || typeof p.y !== "number") return defaultPos();
    return clampPos(p.x, p.y);
  } catch {
    return defaultPos();
  }
}

const fabRef = ref<HTMLElement | null>(null);
let dragOrigin = { x: 0, y: 0 };
let dragMoved = false;

const { x: fabX, y: fabY, style: fabStyle, isDragging } = useDraggable(fabRef, {
  initialValue: typeof window !== "undefined" ? readPos() : { x: 24, y: 200 },
  preventDefault: true,
  onStart(pos) {
    dragMoved = false;
    dragOrigin = { x: pos.x, y: pos.y };
  },
  onMove(pos) {
    const next = clampPos(pos.x, pos.y);
    if (next.x !== pos.x || next.y !== pos.y) {
      fabX.value = next.x;
      fabY.value = next.y;
    }
    if (Math.abs(pos.x - dragOrigin.x) > 6 || Math.abs(pos.y - dragOrigin.y) > 6) dragMoved = true;
  },
  onEnd() {
    const next = clampPos(fabX.value, fabY.value);
    fabX.value = next.x;
    fabY.value = next.y;
    try {
      localStorage.setItem(FAB_POS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
});

useEventListener(window, "resize", () => {
  const next = clampPos(fabX.value, fabY.value);
  fabX.value = next.x;
  fabY.value = next.y;
});

function onFabClick() {
  if (dragMoved) return;
  drawerOpen.value = true;
}

let unlisten: UnlistenFn | undefined;

onMounted(async () => {
  const next = readPos();
  fabX.value = next.x;
  fabY.value = next.y;
  if (!isTauri()) return;
  try {
    await refreshAuth();
    await refreshJob();
    unlisten = await listen<QzoneJobSnapshot>("qzone-sync://progress", ev => {
      job.value = ev.payload;
    });
  } catch {
    /* Web 预览无 invoke */
  }
});

onBeforeUnmount(() => {
  stopQrPoll();
  unlisten?.();
});

watch(drawerOpen, open => {
  if (!isTauri()) return;
  if (open) {
    void refreshAuth().then(() => {
      if (!loggedIn.value) void refreshQr();
      else void loadAlbums();
    });
    void refreshJob();
  } else {
    stopQrPoll();
    previewOpen.value = false;
  }
});
</script>

<template>
  <div ref="fabRef" class="fab-root" :class="{ 'is-dragging': isDragging }" :style="fabStyle">
    <a-button class="fab-btn" shape="circle" size="large" title="QQ 空间同步" @click="onFabClick">
      <IconifyIcon icon="ri:qq-fill" width="28" height="28" />
    </a-button>
  </div>

  <a-drawer
    v-model:open="drawerOpen"
    title="QQ 空间同步"
    placement="right"
    :width="960"
    class="qzone-sync-drawer"
    :body-style="{ padding: '16px 20px', height: '100%', overflow: 'hidden' }"
  >
    <template #extra>
      <a-space v-if="loggedIn" :size="4" align="center">
        <div class="drawer-extra-tag">QQ {{ uin || "—" }}</div>
        <a-button type="link" size="small" danger @click="onLogout">退出</a-button>
      </a-space>
    </template>

    <div v-if="!loggedIn" class="login-block">
      <p class="hint">使用手机 QQ 扫描下方二维码登录；仅同步本人相册到本地。</p>
      <div class="qr-wrap">
        <a-spin :spinning="qrLoading">
          <img v-if="qrImage" :src="qrImage" class="qr-img" alt="QQ 空间登录二维码" />
          <div v-else class="qr-placeholder">{{ qrMessage || "正在获取二维码…" }}</div>
        </a-spin>
      </div>
      <p class="qr-status" :class="qrStatus">{{ qrMessage }}</p>
      <a-button class="mt" :loading="qrLoading" @click="refreshQr">刷新二维码</a-button>
    </div>

    <div v-else class="browser">
      <!-- 对齐 iCloud StatusCard：标题 + 主操作 / 进度统计 / 说明 -->
      <section class="status-card">
        <div class="status-head">
          <div class="status-main">
            <span class="status-title">{{ statusHeadline }}</span>
          </div>
          <div class="action-row">
            <a-button type="primary" :disabled="busy" @click="onSyncAll">全部下载</a-button>
            <a-button :disabled="busy || !activeAlbumId" @click="onSyncAlbum">下载本相册</a-button>
            <a-button v-if="job.status === 'downloading'" danger @click="onPause">暂停</a-button>
            <a-button v-if="job.status === 'paused'" type="primary" @click="onResume">继续</a-button>
            <a-button v-if="busy" danger @click="onCancel">取消任务</a-button>
          </div>
        </div>
        <div v-if="showProgressBar" class="progress-row">
          <a-progress
            class="progress-bar"
            size="small"
            :percent="percent"
            :show-info="false"
            :status="job.status === 'failed' ? 'exception' : job.status === 'done' ? 'success' : 'active'"
          />
          <span v-if="job.total > 0" class="progress-percent">{{ percent }}%</span>
          <span class="progress-stats">{{ progressStatsText }}</span>
        </div>
        <p v-if="statusDescription" class="status-desc">{{ statusDescription }}</p>
      </section>

      <div class="browse-toolbar">
        <span class="browse-hint">左侧选相册，右侧浏览；下载任务见上方进度</span>
        <a-button
          size="small"
          :loading="refreshingCatalog || albumsLoading"
          :disabled="busy"
          @click="onRefreshCatalog"
        >
          刷新目录
        </a-button>
      </div>

      <div class="panes">
        <aside ref="albumPaneRef" class="album-pane">
          <a-spin :spinning="albumsLoading">
            <div
              v-for="a in albums"
              :key="a.topicId"
              class="album-item"
              :class="{ active: a.topicId === activeAlbumId }"
              @click="selectAlbum(a.topicId)"
            >
              <div class="cover">
                <QzoneLazyImg
                  v-if="a.coverUrl"
                  :remote-url="a.coverUrl"
                  :scroll-root="albumPaneRef"
                  kind="thumb"
                />
                <div v-else class="cover-ph">{{ a.name.slice(0, 1) }}</div>
              </div>
              <div class="meta">
                <div class="name" :title="a.name">{{ a.name }}</div>
                <div class="count">{{ a.total }} 项</div>
              </div>
            </div>
            <a-empty v-if="!albumsLoading && !albums.length" description="暂无相册" :image="false" />
          </a-spin>
        </aside>

        <section class="photo-pane">
          <div class="photo-head">
            <span>{{ activeAlbum?.name || "请选择相册" }}</span>
            <span v-if="photos.length" class="sub">{{ photos.length }} 张</span>
          </div>
          <div ref="photoScrollRef" class="photo-scroll">
            <a-spin :spinning="photosLoading">
              <div v-if="photoGroups.length" class="timeline">
                <section v-for="g in photoGroups" :key="g.key" class="day-group">
                  <h4 class="day-label">{{ g.label }}</h4>
                  <div class="grid">
                    <button
                      v-for="row in g.items"
                      :key="row.photo.assetId"
                      type="button"
                      class="cell"
                      :title="row.photo.name"
                      @click="openPreview(row.index)"
                    >
                      <QzoneLazyImg
                        v-if="row.photo.thumbUrl"
                        :remote-url="row.photo.thumbUrl"
                        :scroll-root="photoScrollRef"
                        kind="thumb"
                      />
                      <div v-else class="cell-ph" />
                      <span v-if="row.photo.mediaKind === 'video'" class="badge">视频</span>
                    </button>
                  </div>
                </section>
              </div>
              <a-empty
                v-else-if="!photosLoading && activeAlbumId"
                description="此相册暂无内容"
                :image="false"
              />
            </a-spin>
          </div>
        </section>
      </div>
      <p class="foot-hint">文件落在 <code>QzoneSync/&lt;QQ号&gt;/&lt;相册&gt;/</code>；完成后请刷新相册。</p>
    </div>
  </a-drawer>

  <a-modal
    v-model:open="previewOpen"
    :title="photos[previewIndex]?.name || '预览'"
    :footer="null"
    centered
    width="860px"
    destroy-on-close
    @cancel="previewOpen = false"
  >
    <div class="preview-body">
      <a-button class="nav prev" type="text" @click="previewNav(-1)">‹</a-button>
      <a-spin :spinning="previewLoading" tip="正在准备视频…">
        <video
          v-if="previewIsVideo && previewVideoSrc"
          class="preview-media"
          controls
          autoplay
          :src="previewVideoSrc"
        />
        <BaseImage
          v-else-if="!previewIsVideo && previewImageSrc"
          class="preview-base"
          :src="previewImageSrc"
          fit="contain"
          width="100%"
          height="70vh"
          max-width="100%"
          max-height="70vh"
          :lazy="true"
        />
        <div v-else-if="!previewLoading" class="preview-empty">
          {{ previewIsVideo ? "视频准备中或无法播放" : "暂无预览" }}
        </div>
        <div v-else class="preview-empty" />
      </a-spin>
      <a-button class="nav next" type="text" @click="previewNav(1)">›</a-button>
    </div>
  </a-modal>
</template>

<style scoped lang="scss">
.fab-root {
  position: fixed;
  z-index: 1000;
  touch-action: none;
  user-select: none;
  cursor: grab;
  &.is-dragging {
    cursor: grabbing;
    .fab-btn {
      transform: none;
      transition: none;
    }
  }
}
.fab-btn {
  width: 58px;
  height: 58px;
  padding: 0;
  cursor: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.login-block {
  padding: 0;
}
.drawer-extra-tag {
  font-size: 12px;
  color: var(--color-text-secondary);
  padding: 0 4px;
}
.hint {
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 12px;
}
.mt {
  margin-top: 12px;
}
.qr-wrap {
  display: flex;
  justify-content: center;
  min-height: 180px;
  margin: 8px 0;
}
.qr-img {
  width: 180px;
  height: 180px;
  display: block;
  border-radius: 8px;
  background: #fff;
}
.qr-placeholder {
  width: 180px;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 12px;
  color: var(--color-text-tertiary);
  border: 1px dashed var(--border-color);
  border-radius: 8px;
}
.qr-status {
  text-align: center;
  margin: 0;
  color: var(--color-text-secondary);
  &.scanned {
    color: var(--color-primary);
  }
  &.success {
    color: #52c41e;
  }
  &.error,
  &.expired {
    color: #ff4d4f;
  }
}

.browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
}
.status-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}
.status-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.status-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-top: 4px;
}
.status-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}
.status-desc {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 22px;
}
.progress-bar {
  flex: 1;
  min-width: 80px;
  margin: 0;
}
.progress-percent {
  flex-shrink: 0;
  width: 32px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  text-align: right;
}
.progress-stats {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
.action-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}
.browse-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}
.browse-hint {
  font-size: 12px;
  color: var(--color-text-tertiary);
}
.panes {
  display: flex;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.album-pane {
  width: 220px;
  flex-shrink: 0;
  overflow: auto;
  border-right: 1px solid var(--border-color);
  padding: 8px;
}
.album-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
  &.active {
    background: rgba(22, 119, 255, 0.08);
  }
}
.cover {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: #f0f0f0;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}
.cover-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-weight: 600;
}
.meta {
  min-width: 0;
}
.name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.count {
  font-size: 12px;
  color: var(--color-text-tertiary);
}
.photo-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.photo-head {
  padding: 10px 14px;
  font-weight: 600;
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-shrink: 0;
  .sub {
    font-weight: 400;
    font-size: 12px;
    color: var(--color-text-tertiary);
  }
}
.photo-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 14px 14px;
  overscroll-behavior: contain;
}
.timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.day-group {
  min-width: 0;
}
.day-label {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 4px 0;
  background: linear-gradient(to bottom, #fff 70%, rgba(255, 255, 255, 0));
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 8px;
  align-content: start;
}
.cell {
  position: relative;
  aspect-ratio: 1;
  border: none;
  padding: 0;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: #f5f5f5;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}
.cell-ph {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #f0f0f0, #e8e8e8, #f0f0f0);
  background-size: 200% 100%;
}
.badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  font-size: 11px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 4px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
}
.foot-hint {
  margin: 0;
  padding: 0;
  font-size: 12px;
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}
.preview-body {
  position: relative;
  min-height: 360px;
  max-height: 70vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-media {
  max-width: 100%;
  max-height: 70vh;
  display: block;
  margin: 0 auto;
}
.preview-base {
  display: block;
  margin: 0 auto;
  max-width: 100%;
  max-height: 70vh;

  // a-image 默认按原图像素撑开；强制落在预览框内
  :deep(.base-image),
  :deep(.ant-image),
  :deep(.ant-image-img) {
    max-width: 100% !important;
    max-height: 70vh !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: contain;
  }
}
.preview-empty {
  color: var(--color-text-tertiary);
  padding: 48px;
}
.nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 32px;
  z-index: 2;
  &.prev {
    left: 0;
  }
  &.next {
    right: 0;
  }
}
</style>

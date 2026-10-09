/**
 * 文件资源模式批量勾选（意图先行）
 * 职责：只勾当前 cwd 同级文件夹/文件（可多选切换）；执行时文件夹再展开为含子孙媒体
 * 适用：album/index.vue 文件模式
 * @note 不跨目录累加（换 cwd 由页面 exitIntent）
 */
import type { Ref } from "vue";
import { collectMediaUnderDir, type AlbumDirIndex, type AlbumRelDir } from "./albumFileBrowser";
import type { AlbumFilePlacement } from "./albumFileLayout";
import type { MediaFile } from "./types";
import { MIN_MARQUEE_PX, useMarqueeDrag, type MarqueeBox } from "./useMarqueeDrag";
import type { AlbumSelectIntent } from "./useAlbumGridSelect";

export type { AlbumSelectIntent };

export interface AlbumFileSelectHost {
  scrollEl: HTMLElement;
  canvasEl: HTMLElement;
}

function fileKey(path: string): string {
  return `file:${path}`;
}

function dirKey(relPath: AlbumRelDir): string {
  return `dir:${relPath}`;
}

function parseFileKey(key: string): string | null {
  return key.startsWith("file:") ? key.slice(5) : null;
}

function parseDirKey(key: string): string | null {
  return key.startsWith("dir:") ? key.slice(4) : null;
}

/**
 * @param allFiles 全库媒体（展开后勾选序）
 * @param dirIndex 目录索引（执行时展开文件夹）
 * @param placements 当前 cwd 全量格子（框选）
 * @param cwdFolders 当前层文件夹（剪枝同级键）
 * @param cwdFiles 当前层媒体（剪枝同级键）
 */
export function useAlbumFileSelect(
  allFiles: Ref<MediaFile[]>,
  dirIndex: Ref<AlbumDirIndex>,
  placements: Ref<AlbumFilePlacement[]>,
  cwdFolders: Ref<{ relPath: string }[]>,
  cwdFiles: Ref<MediaFile[]>
) {
  const intent = ref<AlbumSelectIntent>(null);
  const selectMode = computed(() => intent.value != null);
  /** 同级勾选键：`dir:rel` / `file:path` */
  const selectedKeys = ref<Set<string>>(new Set());

  /** 执行用媒体 path = 同级已勾文件 ∪ 已勾文件夹展开（含子孙） */
  const orderedPaths = computed(() => {
    if (selectedKeys.value.size === 0) return [] as string[];
    const picked = new Set<string>();
    for (const key of selectedKeys.value) {
      const filePath = parseFileKey(key);
      if (filePath) {
        picked.add(filePath);
        continue;
      }
      const rel = parseDirKey(key);
      if (!rel) continue;
      for (const file of collectMediaUnderDir(dirIndex.value, rel)) picked.add(file.path);
    }
    if (picked.size === 0) return [] as string[];
    const out: string[] = [];
    for (const file of allFiles.value) {
      if (picked.has(file.path)) out.push(file.path);
    }
    return out;
  });

  function isSelected(path: string): boolean {
    return selectedKeys.value.has(fileKey(path));
  }

  function isFolderSelected(relPath: AlbumRelDir): boolean {
    return selectedKeys.value.has(dirKey(relPath));
  }

  function clearSelection() {
    selectedKeys.value = new Set();
  }

  function enterIntent(next: "captureAt" | "delete"): boolean {
    if (intent.value === next) return true;
    if (intent.value != null) return false;
    clearSelection();
    intent.value = next;
    return true;
  }

  function exitIntent() {
    intent.value = null;
    clearSelection();
  }

  function togglePath(path: string) {
    if (!intent.value) return;
    const key = fileKey(path);
    const next = new Set(selectedKeys.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selectedKeys.value = next;
  }

  function toggleFolder(relPath: AlbumRelDir) {
    if (!intent.value) return;
    const key = dirKey(relPath);
    const next = new Set(selectedKeys.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selectedKeys.value = next;
  }

  /** 批量删除后：去掉已删文件键；文件夹展开后若无剩余媒体则去掉文件夹键 */
  function removePaths(paths: string[]) {
    if (paths.length === 0 || selectedKeys.value.size === 0) return;
    const drop = new Set(paths);
    const next = new Set<string>();
    for (const key of selectedKeys.value) {
      const filePath = parseFileKey(key);
      if (filePath) {
        if (!drop.has(filePath)) next.add(key);
        continue;
      }
      const rel = parseDirKey(key);
      if (!rel) continue;
      const remain = collectMediaUnderDir(dirIndex.value, rel).filter(f => !drop.has(f.path));
      if (remain.length > 0) next.add(key);
    }
    selectedKeys.value = next;
  }

  function remapPaths(renames: { from: string; to: string }[]) {
    if (renames.length === 0 || selectedKeys.value.size === 0) return;
    const map = new Map(renames.map(r => [r.from, r.to]));
    let changed = false;
    const next = new Set<string>();
    for (const key of selectedKeys.value) {
      const filePath = parseFileKey(key);
      if (!filePath) {
        next.add(key);
        continue;
      }
      if (map.has(filePath)) {
        const to = map.get(filePath)?.trim();
        changed = true;
        if (to) next.add(fileKey(to));
      } else {
        next.add(key);
      }
    }
    if (changed) selectedKeys.value = next;
  }

  function pruneToCwd() {
    if (selectedKeys.value.size === 0) return;
    const alive = new Set<string>();
    for (const folder of cwdFolders.value) alive.add(dirKey(folder.relPath));
    for (const file of cwdFiles.value) alive.add(fileKey(file.path));
    let changed = false;
    const next = new Set<string>();
    for (const key of selectedKeys.value) {
      if (alive.has(key)) next.add(key);
      else changed = true;
    }
    if (changed) selectedKeys.value = next;
  }

  watch([cwdFolders, cwdFiles], pruneToCwd);

  let snapshot: Set<string> | null = null;

  /** 框选同级项并入：文件夹 / 文件各记自己的键 */
  function applyMarquee(box: MarqueeBox) {
    if (!intent.value) return;
    if (box.width < MIN_MARQUEE_PX && box.height < MIN_MARQUEE_PX) {
      if (snapshot) selectedKeys.value = new Set(snapshot);
      return;
    }
    const next = new Set(snapshot ?? []);
    const boxRight = box.left + box.width;
    const boxBottom = box.top + box.height;
    for (const item of placements.value) {
      if (item.left >= boxRight || item.left + item.width <= box.left) continue;
      if (item.top >= boxBottom || item.top + item.height <= box.top) continue;
      if (item.item.kind === "folder") next.add(dirKey(item.item.folder.relPath));
      else next.add(fileKey(item.item.file.path));
    }
    selectedKeys.value = next;
  }

  const {
    marqueeStyle,
    marqueeActive,
    onPointerDown: onMarqueePointerDown,
    onDragStart
  } = useMarqueeDrag({
    onBegin() {
      snapshot = new Set(selectedKeys.value);
    },
    onUpdate: applyMarquee,
    onEnd(committed) {
      if (!committed && snapshot) selectedKeys.value = new Set(snapshot);
      snapshot = null;
    }
  });

  function onPointerDown(event: PointerEvent, host: AlbumFileSelectHost) {
    if (!intent.value) return;
    onMarqueePointerDown(event, { scrollEl: host.scrollEl, frameEl: host.canvasEl });
  }

  return {
    intent,
    selectMode,
    orderedPaths,
    marqueeStyle,
    marqueeActive,
    isSelected,
    isFolderSelected,
    enterIntent,
    exitIntent,
    togglePath,
    toggleFolder,
    removePaths,
    remapPaths,
    onPointerDown,
    onDragStart
  };
}

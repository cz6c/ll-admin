/**
 * 相册双模式勾选路由
 * 职责：图库 useAlbumGridSelect + 文件 useAlbumFileSelect 并存；按 viewMode 暴露统一 API
 * 适用：album/index.vue（两套语义不同，禁止硬合成一套选中模型）
 */
import type { Ref } from "vue";
import type { AlbumPathRename } from "@/api/album";
import type { AlbumDirIndex } from "./albumFileBrowser";
import type { AlbumThumbPlacement } from "./albumDayLayout";
import type { AlbumFilePlacement } from "./albumFileLayout";
import type { MediaFile } from "./types";
import { useAlbumFileSelect } from "./useAlbumFileSelect";
import { useAlbumGridSelect, type AlbumSelectIntent } from "./useAlbumGridSelect";

export type AlbumViewMode = "gallery" | "files";

export interface UseAlbumModeSelectOptions {
  viewMode: Ref<AlbumViewMode>;
  /** 图库：当前挂载年份内媒体 */
  galleryFiles: Ref<MediaFile[]>;
  galleryPlacements: Ref<AlbumThumbPlacement[]>;
  /** 文件：全库 + cwd 索引 */
  allFiles: Ref<MediaFile[]>;
  dirIndex: Ref<AlbumDirIndex>;
  filePlacements: Ref<AlbumFilePlacement[]>;
  cwdFolders: Ref<{ relPath: string }[]>;
  cwdFiles: Ref<MediaFile[]>;
}

/**
 * @returns 当前模式意图/勾选/框选，以及图库、文件各自的指针入口
 */
export function useAlbumModeSelect(options: UseAlbumModeSelectOptions) {
  const {
    intent: galleryIntent,
    selectMode: gallerySelectMode,
    orderedPaths: gallerySelectedPaths,
    marqueeStyle: galleryMarqueeStyle,
    marqueeActive: galleryMarqueeActive,
    isSelected: isGallerySelected,
    enterIntent: enterGalleryIntent,
    exitIntent: exitGalleryIntent,
    togglePath: toggleGalleryPath,
    removePaths: removeGalleryPaths,
    remapPaths: remapGalleryPaths,
    onPointerDown: onGalleryPointerDown,
    onDragStart: onGalleryDragStart
  } = useAlbumGridSelect(options.galleryFiles, options.galleryPlacements);

  const {
    intent: fileIntent,
    selectMode: fileSelectMode,
    orderedPaths: fileSelectedPaths,
    marqueeStyle: fileMarqueeStyle,
    marqueeActive: fileMarqueeActive,
    isSelected: isFileSelected,
    isFolderSelected,
    enterIntent: enterFileIntent,
    exitIntent: exitFileIntent,
    togglePath: toggleFilePath,
    toggleFolder,
    removePaths: removeFilePaths,
    remapPaths: remapFilePaths,
    onPointerDown: onFilePointerDown,
    onDragStart: onFileDragStart
  } = useAlbumFileSelect(
    options.allFiles,
    options.dirIndex,
    options.filePlacements,
    options.cwdFolders,
    options.cwdFiles
  );

  const isGallery = computed(() => options.viewMode.value === "gallery");

  const intent = computed(() => (isGallery.value ? galleryIntent.value : fileIntent.value));
  const selectMode = computed(() => (isGallery.value ? gallerySelectMode.value : fileSelectMode.value));
  const selectedPaths = computed(() => (isGallery.value ? gallerySelectedPaths.value : fileSelectedPaths.value));
  const marqueeStyle = computed(() => (isGallery.value ? galleryMarqueeStyle.value : fileMarqueeStyle.value));
  const marqueeActive = computed(() => (isGallery.value ? galleryMarqueeActive.value : fileMarqueeActive.value));

  function isSelected(path: string) {
    return isGallery.value ? isGallerySelected(path) : isFileSelected(path);
  }

  function enterIntent(next: Exclude<AlbumSelectIntent, null>) {
    return isGallery.value ? enterGalleryIntent(next) : enterFileIntent(next);
  }

  /** 两套一并清空，避免切模式后残留 */
  function exitIntent() {
    exitGalleryIntent();
    exitFileIntent();
  }

  function removePaths(paths: string[]) {
    if (isGallery.value) removeGalleryPaths(paths);
    else removeFilePaths(paths);
  }

  function remapPaths(renames: AlbumPathRename[]) {
    if (isGallery.value) remapGalleryPaths(renames);
    else remapFilePaths(renames);
  }

  return {
    intent,
    selectMode,
    selectedPaths,
    marqueeStyle,
    marqueeActive,
    isSelected,
    isFolderSelected,
    enterIntent,
    exitIntent,
    removePaths,
    remapPaths,
    toggleGalleryPath,
    onGalleryPointerDown,
    onGalleryDragStart,
    toggleFilePath,
    toggleFolder,
    onFilePointerDown,
    onFileDragStart
  };
}

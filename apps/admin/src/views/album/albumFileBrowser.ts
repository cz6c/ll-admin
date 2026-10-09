/**
 * 本地相册「文件资源」模式：从扫描索引派生目录导航
 * 职责：相对路径归一、cwd 下列表（子目录 + 直属媒体）、面包屑
 * 适用：AlbumFileBrowser / album index 双模式；不读盘，空目录与非媒体不出现
 */

import type { MediaFile } from "./types";

/** 相对相册根的目录路径（`.` = 根） */
export type AlbumRelDir = string;

/** 资源模式下一层子文件夹 */
export interface AlbumFileFolder {
  /** 最后一级目录名 */
  name: string;
  /** 相对相册根路径 */
  relPath: AlbumRelDir;
  /** Finder 封面：本层或子孙中优先有缩略图的媒体 */
  cover?: MediaFile;
}

/** 面包屑节点 */
export interface AlbumBreadcrumbCrumb {
  /** 展示文案 */
  title: string;
  /** 点击跳转目标 relPath */
  relPath: AlbumRelDir;
}

/** 由媒体列表预计算的目录索引 */
export interface AlbumDirIndex {
  /** 父目录 → 直接子文件夹（已排序） */
  childDirs: Map<AlbumRelDir, AlbumFileFolder[]>;
  /** 目录 → 该层直属媒体（已按文件名排序） */
  filesByDir: Map<AlbumRelDir, MediaFile[]>;
  /** 索引中出现过的目录（含仅有子孙媒体的中间段） */
  knownDirs: Set<AlbumRelDir>;
}

/**
 * 相对目录归一：反斜杠→`/`；空/`./` → `.`
 */
export function normalizeAlbumRelDir(rel?: string): AlbumRelDir {
  const s = (rel ?? ".").trim().replace(/\\/g, "/") || ".";
  return s === "" ? "." : s;
}

/**
 * 从已扫描媒体建目录索引（含中间空段文件夹节点）
 * @param files 全库媒体（文件模式不做图库筛）
 */
export function buildAlbumDirIndex(files: MediaFile[]): AlbumDirIndex {
  const knownDirs = new Set<AlbumRelDir>(["."]);
  const filesByDir = new Map<AlbumRelDir, MediaFile[]>();

  for (const file of files) {
    const dir = normalizeAlbumRelDir(file.relDir);
    knownDirs.add(dir);
    if (dir !== ".") {
      const parts = dir.split("/");
      for (let i = 1; i < parts.length; i++) {
        knownDirs.add(parts.slice(0, i).join("/"));
      }
    }
    const bucket = filesByDir.get(dir);
    if (bucket) bucket.push(file);
    else filesByDir.set(dir, [file]);
  }

  for (const list of filesByDir.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }

  const childDirs = new Map<AlbumRelDir, AlbumFileFolder[]>();
  const sortedDirs = [...knownDirs].filter(d => d !== ".").sort((a, b) => a.localeCompare(b, "zh"));
  for (const path of sortedDirs) {
    const parts = path.split("/");
    const parent = parts.length === 1 ? "." : parts.slice(0, -1).join("/");
    const folder: AlbumFileFolder = { name: parts[parts.length - 1]!, relPath: path };
    const siblings = childDirs.get(parent);
    if (siblings) siblings.push(folder);
    else childDirs.set(parent, [folder]);
  }

  for (const list of childDirs.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }

  return { childDirs, filesByDir, knownDirs };
}

/**
 * 文件夹封面：本层有图优先，否则取子孙中第一张有缩略图的媒体
 */
export function pickFolderCover(index: AlbumDirIndex, folderRel: AlbumRelDir): MediaFile | undefined {
  const key = normalizeAlbumRelDir(folderRel);
  const prefer = (list: MediaFile[]) => list.find(f => !!f.thumbPath?.trim()) ?? list[0];

  const direct = index.filesByDir.get(key);
  if (direct?.length) {
    const hit = prefer(direct);
    if (hit) return hit;
  }

  const prefix = `${key}/`;
  for (const [dir, files] of index.filesByDir) {
    if (!dir.startsWith(prefix) || files.length === 0) continue;
    const hit = prefer(files);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * 列出 cwd 下直接子文件夹与直属媒体（文件夹附带封面）
 */
export function listAlbumCwd(
  index: AlbumDirIndex,
  cwd: AlbumRelDir
): { folders: AlbumFileFolder[]; files: MediaFile[] } {
  const key = normalizeAlbumRelDir(cwd);
  const folders = (index.childDirs.get(key) ?? []).map(folder => ({
    ...folder,
    cover: pickFolderCover(index, folder.relPath)
  }));
  return {
    folders,
    files: index.filesByDir.get(key) ?? []
  };
}

/**
 * 面包屑：相册根 + 各级祖先（含当前）
 * @param cwd 当前相对目录
 */
export function buildAlbumBreadcrumb(cwd: AlbumRelDir): AlbumBreadcrumbCrumb[] {
  const key = normalizeAlbumRelDir(cwd);
  const crumbs: AlbumBreadcrumbCrumb[] = [{ title: "相册根", relPath: "." }];
  if (key === ".") return crumbs;
  const parts = key.split("/");
  for (let i = 0; i < parts.length; i++) {
    crumbs.push({
      title: parts[i]!,
      relPath: parts.slice(0, i + 1).join("/")
    });
  }
  return crumbs;
}

/**
 * cwd 是否仍在索引中；扫描删空后用于回退根目录
 */
export function albumDirExists(index: AlbumDirIndex, cwd: AlbumRelDir): boolean {
  return index.knownDirs.has(normalizeAlbumRelDir(cwd));
}

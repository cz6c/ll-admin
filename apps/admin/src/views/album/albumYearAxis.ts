/**
 * 相册年份导航锚点
 * 职责：把已按拍摄时间升序的媒体切成年份起点；提供首屏最新年、邻年扩展
 * 适用：本地相册左侧轴与右侧按年窗口挂载。无拍摄时间的归入「未知」并沉在末尾
 */
import { dateUtil } from "@llcz/common";
import type { MediaFile } from "./types";

/** 无拍摄时间的轴 key */
export const ALBUM_AXIS_UNKNOWN = "unknown";

/** 某年第一张在全库筛选列表中的下标 */
export interface AlbumAxisYear {
  /** `YYYY`，或 `unknown` */
  key: string;
  label: string;
  startIndex: number;
}

/** 单文件所属年；无效时间进未知桶 */
export function albumYearKey(file: MediaFile): string {
  const raw = file.captureAt?.trim();
  if (raw) {
    const parsed = dateUtil(raw);
    if (parsed.isValid()) return parsed.format("YYYY");
  }
  return ALBUM_AXIS_UNKNOWN;
}

function yearLabel(key: string): string {
  return key === ALBUM_AXIS_UNKNOWN ? "未知" : key;
}

/**
 * 按列表顺序扫一遍，同年合并成一个锚点
 * @param files 必须已是拍摄时间升序，未知沉底
 */
export function buildAlbumYearAxis(files: MediaFile[]): AlbumAxisYear[] {
  const years: AlbumAxisYear[] = [];
  let year: AlbumAxisYear | null = null;
  for (let i = 0; i < files.length; i += 1) {
    const key = albumYearKey(files[i]!);
    if (year && year.key === key) continue;
    year = { key, label: yearLabel(key), startIndex: i };
    years.push(year);
  }
  return years;
}

/**
 * 首屏年份：有日历年则取最新一年；否则「未知」
 * 列表已升序，最后一个非未知即最新
 */
export function pickLatestYearKey(years: AlbumAxisYear[]): string {
  for (let i = years.length - 1; i >= 0; i -= 1) {
    const key = years[i]?.key;
    if (key && key !== ALBUM_AXIS_UNKNOWN) return key;
  }
  return years[years.length - 1]?.key ?? "";
}

/** 邻年；到头返回 null */
export function neighborYearKey(years: AlbumAxisYear[], currentKey: string, delta: -1 | 1): string | null {
  const index = years.findIndex(year => year.key === currentKey);
  if (index < 0) return null;
  return years[index + delta]?.key ?? null;
}

/**
 * 键盘上下切年份；到头返回 null
 */
export function stepAlbumYear(years: AlbumAxisYear[], currentKey: string, delta: -1 | 1): AlbumAxisYear | null {
  if (years.length === 0) return null;
  const index = years.findIndex(year => year.key === currentKey);
  if (index < 0) return delta > 0 ? (years[0] ?? null) : null;
  return years[index + delta] ?? null;
}

/** 只保留已挂载年份的媒体（顺序与全库筛选一致） */
export function filterFilesByYearKeys(files: MediaFile[], yearKeys: string[]): MediaFile[] {
  if (yearKeys.length === 0) return [];
  const set = new Set(yearKeys);
  return files.filter(file => set.has(albumYearKey(file)));
}

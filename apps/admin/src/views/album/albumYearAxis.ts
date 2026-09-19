/**
 * 相册年份-月份导航锚点
 * 职责：把已按拍摄时间升序的媒体切成「年 → 月」起点，供左侧轴高亮和跳转
 * 适用：本地相册宫格。无拍摄时间或无法解析的归入「未知」，且因排序沉在末尾
 */
import { dateUtil } from "@llcz/common";
import type { MediaFile } from "./types";

/** 无拍摄时间的轴 key；不拆月份 */
export const ALBUM_AXIS_UNKNOWN = "unknown";

/** 某月第一张在扁平列表中的下标 */
export interface AlbumAxisMonth {
  /** `YYYY-MM` */
  key: string;
  label: string;
  startIndex: number;
}

/** 某年第一张；months 只含该年实际有照片的月 */
export interface AlbumAxisYear {
  /** `YYYY`，或 `unknown` */
  key: string;
  label: string;
  startIndex: number;
  months: AlbumAxisMonth[];
}

interface AxisMark {
  yearKey: string;
  monthKey: string;
  yearLabel: string;
  monthLabel: string;
}

/** 单文件的年/月轴坐标；无效时间进未知桶 */
function axisMark(file: MediaFile): AxisMark {
  const raw = file.captureAt?.trim();
  if (raw) {
    const parsed = dateUtil(raw);
    if (parsed.isValid()) {
      const yearKey = parsed.format("YYYY");
      const month = parsed.month() + 1;
      return {
        yearKey,
        monthKey: `${yearKey}-${String(month).padStart(2, "0")}`,
        yearLabel: yearKey,
        monthLabel: `${month}月`
      };
    }
  }
  return {
    yearKey: ALBUM_AXIS_UNKNOWN,
    monthKey: ALBUM_AXIS_UNKNOWN,
    yearLabel: "未知",
    monthLabel: "未知"
  };
}

/**
 * 按列表顺序扫一遍，同年同月合并成一个锚点
 * @param files 必须已是拍摄时间升序，未知沉底
 */
export function buildAlbumYearAxis(files: MediaFile[]): AlbumAxisYear[] {
  const years: AlbumAxisYear[] = [];
  let year: AlbumAxisYear | null = null;
  let monthKey = "";
  for (let i = 0; i < files.length; i += 1) {
    const mark = axisMark(files[i]!);
    if (!year || year.key !== mark.yearKey) {
      year = {
        key: mark.yearKey,
        label: mark.yearLabel,
        startIndex: i,
        months: []
      };
      years.push(year);
      monthKey = "";
    }
    if (mark.yearKey === ALBUM_AXIS_UNKNOWN || monthKey === mark.monthKey) continue;
    monthKey = mark.monthKey;
    year.months.push({
      key: mark.monthKey,
      label: mark.monthLabel,
      startIndex: i
    });
  }
  return years;
}

/**
 * 可视区第一张落在哪一年、哪一月
 * @param index 扁平列表下标（不含虚拟滚动缓冲）
 */
export function findAxisAt(years: AlbumAxisYear[], index: number): { yearKey: string; monthKey: string } | null {
  let hit: AlbumAxisYear | null = null;
  for (const year of years) {
    if (year.startIndex <= index) hit = year;
    else break;
  }
  if (!hit) return null;
  let monthKey = "";
  for (const month of hit.months) {
    if (month.startIndex <= index) monthKey = month.key;
    else break;
  }
  return { yearKey: hit.key, monthKey };
}

/**
 * 键盘上下切年份；到头返回 null，调用方不要循环
 */
export function stepAlbumYear(years: AlbumAxisYear[], currentKey: string, delta: -1 | 1): AlbumAxisYear | null {
  if (years.length === 0) return null;
  const index = years.findIndex(year => year.key === currentKey);
  if (index < 0) return delta > 0 ? (years[0] ?? null) : null;
  return years[index + delta] ?? null;
}

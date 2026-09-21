/**
 * 相册按日分组布局
 * 职责：把已排序媒体切成「日标题 + 当日宫格」，算出绝对坐标供虚拟滚动与框选
 * 适用：右侧照片墙。同一天未排满的行不留给下一天；无拍摄时间整组「未知」
 */
import { dateUtil } from "@llcz/common";
import { ALBUM_AXIS_UNKNOWN } from "./albumYearAxis";
import type { MediaFile } from "./types";

/** 日标题行高；与样式 `.day-header` 一致 */
export const DAY_HEADER_HEIGHT = 32;

export interface AlbumDaySection {
  /** `YYYY-MM-DD` 或 `unknown` */
  key: string;
  label: string;
  yearKey: string;
  files: MediaFile[];
  /** 标题顶边相对 canvas */
  headerTop: number;
  /** 本段总高 = 标题 + 宫格行 */
  height: number;
}

export interface AlbumThumbPlacement {
  file: MediaFile;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AlbumDayLayout {
  sections: AlbumDaySection[];
  placements: AlbumThumbPlacement[];
  totalHeight: number;
}

interface DayMark {
  key: string;
  label: string;
  yearKey: string;
}

function dayMark(file: MediaFile): DayMark {
  const raw = file.captureAt?.trim();
  if (raw) {
    const parsed = dateUtil(raw);
    if (parsed.isValid()) {
      return {
        key: parsed.format("YYYY-MM-DD"),
        label: parsed.format("YYYY年M月D日"),
        yearKey: parsed.format("YYYY")
      };
    }
  }
  return { key: ALBUM_AXIS_UNKNOWN, label: "未知拍摄时间", yearKey: ALBUM_AXIS_UNKNOWN };
}

/**
 * 按日分段并铺绝对坐标
 * @param files 当前已挂载年份内的媒体（升序）
 */
export function buildAlbumDayLayout(
  files: MediaFile[],
  cols: number,
  thumbSize: number,
  gap: number,
  headerHeight = DAY_HEADER_HEIGHT
): AlbumDayLayout {
  if (files.length === 0 || cols <= 0 || thumbSize <= 0) {
    return { sections: [], placements: [], totalHeight: 0 };
  }

  const sections: AlbumDaySection[] = [];
  let bucket: MediaFile[] = [];
  let mark: DayMark | null = null;

  const flush = () => {
    if (!mark || bucket.length === 0) return;
    const rows = Math.ceil(bucket.length / cols);
    const gridHeight = rows * (thumbSize + gap);
    const headerTop = sections.length === 0 ? 0 : sections[sections.length - 1]!.headerTop + sections[sections.length - 1]!.height;
    sections.push({
      key: mark.key,
      label: mark.label,
      yearKey: mark.yearKey,
      files: bucket,
      headerTop,
      height: headerHeight + gridHeight
    });
    bucket = [];
    mark = null;
  };

  for (const file of files) {
    const next = dayMark(file);
    if (mark && mark.key !== next.key) flush();
    if (!mark) mark = next;
    bucket.push(file);
  }
  flush();

  const placements: AlbumThumbPlacement[] = [];
  const cell = thumbSize + gap;
  for (const section of sections) {
    const gridTop = section.headerTop + headerHeight;
    section.files.forEach((file, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      placements.push({
        file,
        left: col * cell,
        top: gridTop + row * (thumbSize + gap),
        width: thumbSize,
        height: thumbSize
      });
    });
  }

  const last = sections[sections.length - 1];
  const totalHeight = last ? last.headerTop + last.height : 0;
  return { sections, placements, totalHeight };
}

/**
 * 滚动位置落在哪一段（用标题顶边）
 * 供左侧年份高亮：取该段 yearKey
 */
export function findDaySectionAt(layout: AlbumDayLayout, scrollY: number): AlbumDaySection | null {
  const { sections } = layout;
  if (sections.length === 0) return null;
  let hit = sections[0]!;
  for (const section of sections) {
    if (section.headerTop <= scrollY) hit = section;
    else break;
  }
  return hit;
}

/**
 * 可视区命中的日标题与缩略图（含缓冲带）
 */
export function sliceVisibleDayLayout(
  layout: AlbumDayLayout,
  scrollY: number,
  viewportHeight: number,
  bufferPx: number
): { sections: AlbumDaySection[]; placements: AlbumThumbPlacement[] } {
  const top = Math.max(0, scrollY - bufferPx);
  const bottom = scrollY + viewportHeight + bufferPx;
  const sections = layout.sections.filter(section => {
    const sectionBottom = section.headerTop + section.height;
    return section.headerTop < bottom && sectionBottom > top;
  });
  const placements = layout.placements.filter(item => {
    const itemBottom = item.top + item.height;
    return item.top < bottom && itemBottom > top;
  });
  return { sections, placements };
}

/** 框选：只命中缩略图矩形，不命中日标题与未排满空位 */
export function hitTestThumbPlacements(
  placements: AlbumThumbPlacement[],
  box: { left: number; top: number; width: number; height: number }
): string[] {
  const boxRight = box.left + box.width;
  const boxBottom = box.top + box.height;
  const hits: string[] = [];
  for (const item of placements) {
    if (item.left < boxRight && item.left + item.width > box.left && item.top < boxBottom && item.top + item.height > box.top) {
      hits.push(item.file.path);
    }
  }
  return hits;
}

/** 某年在布局中的顶边；用于跳转 */
export function yearStartTop(layout: AlbumDayLayout, yearKey: string): number {
  const section = layout.sections.find(item => item.yearKey === yearKey);
  return section?.headerTop ?? 0;
}

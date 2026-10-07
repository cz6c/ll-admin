/**
 * 相册来源图库键与展示
 * 职责：origin + originAccount 归一化、编码/解码、切换器文案与筛选匹配
 * 适用：本地相册宫格图库选择器（默认「全部图库」）、按图库过滤 filteredFiles
 */

export const LOCAL_ORIGIN = "local";
export const LOCAL_ACCOUNT = "_local";

/** 图库唯一键；与 media.origin + origin_account 语义一致 */
export type AlbumLibraryKey = { origin: string; originAccount: string };

/**
 * 归一化图库键：trim 后 origin 与 originAccount 均为空则视为本地图库
 * @param file 含可选 origin / originAccount 的媒体或片段
 */
export function normalizeLibraryKey(file: {
  origin?: string;
  originAccount?: string;
}): AlbumLibraryKey {
  const origin = file.origin?.trim() ?? "";
  const originAccount = file.originAccount?.trim() ?? "";
  if (!origin && !originAccount) {
    return { origin: LOCAL_ORIGIN, originAccount: LOCAL_ACCOUNT };
  }
  return { origin, originAccount };
}

/**
 * 将图库键编码为切换器 value（JSON 数组字符串，可 round-trip）
 */
export function encodeLibraryKey(key: AlbumLibraryKey): string {
  return JSON.stringify([key.origin, key.originAccount]);
}

/**
 * 解码切换器 value 为图库键；非法 payload 抛错（调用方应只传入 encode 产物）
 */
export function decodeLibraryKey(raw: string): AlbumLibraryKey {
  const parsed: unknown = JSON.parse(raw);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string"
  ) {
    throw new Error(`invalid library key: ${raw}`);
  }
  return normalizeLibraryKey({ origin: parsed[0], originAccount: parsed[1] });
}

/**
 * 图库切换器展示文案
 * @note local + _local →「本地」；icloud / qzone 用固定前缀，其余 `${origin} · ${account}`
 */
export function libraryLabel(key: AlbumLibraryKey): string {
  const normalized = normalizeLibraryKey(key);
  if (normalized.origin === LOCAL_ORIGIN && normalized.originAccount === LOCAL_ACCOUNT) {
    return "本地";
  }
  if (normalized.origin === "icloud") {
    return `iCloud · ${normalized.originAccount}`;
  }
  if (normalized.origin === "qzone") {
    return `QQ 空间 · ${normalized.originAccount}`;
  }
  return `${normalized.origin} · ${normalized.originAccount}`;
}

/**
 * 从媒体列表收集去重图库选项，按中文 label 排序
 * @returns value 为 encodeLibraryKey，label 为 libraryLabel
 */
export function collectLibraryOptions(
  files: Array<{ origin?: string; originAccount?: string }>
): { value: string; label: string }[] {
  const map = new Map<string, string>();
  for (const file of files) {
    const key = normalizeLibraryKey(file);
    const value = encodeLibraryKey(key);
    if (!map.has(value)) {
      map.set(value, libraryLabel(key));
    }
  }
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
}

/**
 * 判断媒体是否属于当前图库筛选
 * @param filter null 表示「全部图库」，恒为 true
 */
export function matchesLibrary(
  file: { origin?: string; originAccount?: string },
  filter: string | null
): boolean {
  if (filter === null) return true;
  return encodeLibraryKey(normalizeLibraryKey(file)) === filter;
}

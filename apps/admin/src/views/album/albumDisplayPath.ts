/**
 * 相册路径展示工具
 * 职责：绝对路径 → 相对相册根（与侧栏树 relPath 一样用 `/`）
 * 适用：重复清理弹窗等仅展示场景；删盘/invoke 仍传绝对路径
 */

/**
 * 将绝对路径显示为相对相册根；不在根下或未配置根时原样返回
 * @param absolutePath 媒体绝对路径
 * @param albumRoot 相册根目录（settings.rootDir）
 */
export function toAlbumRelativePath(absolutePath: string, albumRoot: string): string {
  const path = absolutePath.trim();
  if (!path) return path;
  const root = albumRoot.trim().replace(/[/\\]+$/, "");
  if (!root) return path;

  const norm = (s: string) => s.replace(/\\/g, "/");
  const p = norm(path);
  const r = norm(root);
  const pCmp = p.toLowerCase();
  const rCmp = r.toLowerCase();
  if (pCmp === rCmp) return ".";
  if (pCmp.startsWith(`${rCmp}/`)) {
    return p.slice(r.length).replace(/^\/+/, "") || ".";
  }
  return path;
}

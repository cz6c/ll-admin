/**
 * 拉新渠道来源校验
 * 与 uni `channelFrom` 规则一致：1–32 位 \w 与短横线，非法返回 null
 */
const SOURCE_RE = /^[\w-]{1,32}$/;

/**
 * 规范化拉新来源；空串或非法返回 null（调用方勿覆盖已有 source）
 */
export function normalizeRegisterSource(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!SOURCE_RE.test(s)) {
    return null;
  }
  return s;
}

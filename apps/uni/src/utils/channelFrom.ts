/**
 * 拉新渠道参数 from
 * 职责：校验、本地读写、拼分享/落地 query
 * 适用：App 启动、salary 入口页、核对详情转发
 */

/** 本地存储：最近一次合法渠道码 */
export const CHANNEL_FROM_KEY = 'salary_channel_from'

/** 无既有渠道时，分享落地默认 from */
export const DEFAULT_SHARE_FROM = 'share'

/**
 * 分享卡片封面：固定品牌海报，避免微信默认截取详情页把金额带进缩略图
 * @note 路径相对小程序根目录；图内不含薪资金额
 */
export const SHARE_POSTER_URL = '/static/share/salary-share-poster.png'

/** 1–32 位字母数字下划线短横线，防止任意字符串污染归因 */
const FROM_RE = /^[\w-]{1,32}$/

/**
 * 规范化渠道码；非法返回 null（调用方勿覆盖已有 storage）
 */
export function normalizeChannelFrom(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!FROM_RE.test(s))
    return null
  return s
}

/** 合法则写入 storage；非法忽略 */
export function captureChannelFrom(raw: unknown): void {
  const v = normalizeChannelFrom(raw)
  if (!v)
    return
  uni.setStorageSync(CHANNEL_FROM_KEY, v)
}

/** 读已存渠道；无或非法则空串 */
export function getChannelFrom(): string {
  const v = normalizeChannelFrom(uni.getStorageSync(CHANNEL_FROM_KEY))
  return v ?? ''
}

/**
 * 拼 `from=xxx`：优先已存渠道，否则 fallback（分享默认 share）
 */
export function buildFromQuery(fallback: string = DEFAULT_SHARE_FROM): string {
  const from = getChannelFrom() || normalizeChannelFrom(fallback) || DEFAULT_SHARE_FROM
  return `from=${encodeURIComponent(from)}`
}

/** 从启动/页面 query 捕获 from */
export function captureChannelFromQuery(query?: Record<string, unknown> | null): void {
  if (!query || query.from == null)
    return
  captureChannelFrom(query.from)
}

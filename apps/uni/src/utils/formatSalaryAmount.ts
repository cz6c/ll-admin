/**
 * 薪资金额展示格式化
 * 职责：千分位 + 最多两位小数；供列表、详情、核对提示共用
 */

/**
 * 金额千分位展示
 * @note NaN/非有限数按 0 处理，避免 toLocaleString 出异常字符串
 */
export function formatSalaryAmount(value: number) {
  const amount = Number(value || 0)
  const safeValue = Number.isFinite(amount) ? amount : 0
  return safeValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * 金额「万元」展示（如 15.2 万）；不足 1 万仍用元千分位
 * @note 明细页主标/徽章用，避免大额挤版
 */
export function formatSalaryWan(value: number) {
  const amount = Number(value || 0)
  const safeValue = Number.isFinite(amount) ? amount : 0
  if (Math.abs(safeValue) < 10000)
    return formatSalaryAmount(safeValue)
  const wan = Math.round(safeValue / 1000) / 10
  const text = Number.isInteger(wan) ? String(wan) : wan.toFixed(1)
  return `${text} 万`
}

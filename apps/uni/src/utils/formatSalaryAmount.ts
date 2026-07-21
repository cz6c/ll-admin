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
  return safeValue.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

import dayjs from 'dayjs'

/** 历史记录时间展示：今天/昨天/日期 + 时分（支持毫秒时间戳或 ISO 字符串） */
export function formatHistoryTime(value: number | string | Date): string {
  const d = dayjs(value)
  const now = dayjs()
  const diffDays = now.startOf('day').diff(d.startOf('day'), 'day')

  if (diffDays === 0)
    return `今天 ${d.format('HH:mm')}`
  if (diffDays === 1)
    return `昨天 ${d.format('HH:mm')}`
  if (diffDays < 7)
    return `${diffDays}天前 ${d.format('HH:mm')}`
  return d.format('YYYY-MM-DD HH:mm')
}

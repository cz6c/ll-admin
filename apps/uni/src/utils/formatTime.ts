import dayjs from 'dayjs'

/** 历史记录时间展示：今天/昨天/日期 + 时分 */
export function formatHistoryTime(ts: number): string {
  const d = dayjs(ts)
  const now = dayjs()
  const diffDays = now.startOf('day').diff(d.startOf('day'), 'day')

  if (diffDays === 0)
    return `今天 ${d.format('HH:mm')}`
  if (diffDays === 1)
    return `昨天 ${d.format('HH:mm')}`
  if (diffDays < 7)
    return d.format('ddd HH:mm')
  return d.format('MM/DD HH:mm')
}

/**
 * 首页「最近记录」与历史列表共用的展示模型与标题拼装
 * 职责：把统一历史记录映射为扫读友好的列表行（类型 / 主文 / 右侧强调）
 * 适用：home.vue 最近记录、history.vue 合并列表
 */
import type { PayslipVerifyRecord, SalaryHistoryRecord } from '@/store/salaryHistory'
import dayjs from 'dayjs'
import { toVerifyRecord } from '@/store/salaryHistory'
import { formatSalaryAmount } from '@/utils/formatSalaryAmount'
import { formatPayPeriodLabel } from '@/utils/payPeriod'
import { computeVerifyForRecord } from '@/utils/payslipVerify'

export { formatSalaryAmount } from '@/utils/formatSalaryAmount'

/** 行主题色：测算用主色，核对用成功色（类型胶囊） */
export type SalaryHistoryEntryTheme = 'blue' | 'green'

/** 历史业务类型，对应后端 historyType */
export type SalaryHistoryEntryKind = 'calc' | 'verify'

/** 右侧强调色调：测算金额 / 核对无误 / 核对有差异 */
export type SalaryHistoryEmphasisTone = 'primary' | 'success' | 'warning'

/** 首页最近记录 / 历史列表共用的展示行模型 */
export interface SalaryHistoryEntry {
  /** 列表 key，含 kind 前缀避免两类 id 冲突 */
  key: string
  kind: SalaryHistoryEntryKind
  /** 业务记录 id（不含 kind 前缀） */
  id: string
  /** 主标题（测算：月薪基数；核对：含年份的所属月工资条） */
  title: string
  /** 副标题：更新日期 MM-DD */
  subtitle: string
  /** 行主题色，驱动类型胶囊 */
  theme: SalaryHistoryEntryTheme
  /** 右侧强调文案：金额或核对结果 */
  emphasis: string
  /** 右侧强调色调 */
  emphasisTone: SalaryHistoryEmphasisTone
  /** 点击跳转详情页路径 */
  url: string
  /** 用于排序的更新时间毫秒戳 */
  time: number
  /** 核对记录删除确认文案用，测算无此字段 */
  payPeriod?: string
}

/** 测算历史主标题：金额拆到右侧 emphasis */
export function buildCalcHistoryTitle(_item: SalaryHistoryRecord) {
  return '月薪基数'
}

/** 测算右侧金额 */
export function buildCalcHistoryEmphasis(item: SalaryHistoryRecord) {
  return `¥${formatSalaryAmount(item.preTaxMonthly)}`
}

/**
 * 核对历史主标题：含年份的所属月 +「工资条」
 * 为何带年：跨年列表仅写「3 月」会歧义；展示与 formatPayPeriodLabel 对齐
 */
export function buildVerifyHistoryTitle(item: PayslipVerifyRecord) {
  return `${formatPayPeriodLabel(item.payPeriod)}工资条`
}

/**
 * 核对右侧结果文案与色调
 * @param allVerifyRecords 同年累计预扣依赖的全量核对记录，缺月会影响差异计算
 */
export function buildVerifyHistoryEmphasis(
  item: PayslipVerifyRecord,
  allVerifyRecords: PayslipVerifyRecord[],
): { text: string, tone: SalaryHistoryEmphasisTone } {
  if (item.useInferredForCumulative && item.inferredPreTax != null) {
    return { text: '已按报税收入', tone: 'success' }
  }
  const verify = computeVerifyForRecord(item, allVerifyRecords)
  if (verify.overallMatch)
    return { text: '无误', tone: 'success' }
  if (verify.reportBias === 'under')
    return { text: '报税偏低', tone: 'warning' }
  if (verify.reportBias === 'over')
    return { text: '报税偏高', tone: 'warning' }
  return { text: '有差异', tone: 'warning' }
}

/** 副标题：仅更新日期（类型改由行内胶囊展示，避免与 title 重复） */
function buildSubtitle(updateTime: string) {
  return dayjs(updateTime).format('MM-DD')
}

/** 测算记录 → 统一展示行 */
export function mapCalcHistoryEntry(item: SalaryHistoryRecord): SalaryHistoryEntry {
  return {
    key: `calc-${item.id}`,
    kind: 'calc',
    id: item.id,
    title: buildCalcHistoryTitle(item),
    subtitle: buildSubtitle(item.updateTime),
    theme: 'blue',
    emphasis: buildCalcHistoryEmphasis(item),
    emphasisTone: 'primary',
    url: `/pages/salary/detail?id=${encodeURIComponent(item.id)}`,
    time: dayjs(item.updateTime).valueOf() || 0,
  }
}

/**
 * 核对记录 → 统一展示行
 * @param allVerifyRecords 传入全量核对列表以正确计算累计预扣差异
 */
export function mapVerifyHistoryEntry(
  item: PayslipVerifyRecord,
  allVerifyRecords: PayslipVerifyRecord[],
): SalaryHistoryEntry {
  const emphasis = buildVerifyHistoryEmphasis(item, allVerifyRecords)
  return {
    key: `verify-${item.id}`,
    kind: 'verify',
    id: item.id,
    title: buildVerifyHistoryTitle(item),
    subtitle: buildSubtitle(item.updateTime),
    theme: 'green',
    emphasis: emphasis.text,
    emphasisTone: emphasis.tone,
    url: `/pages/salary/verify-detail?id=${encodeURIComponent(item.id)}`,
    time: dayjs(item.updateTime).valueOf() || 0,
    payPeriod: item.payPeriod,
  }
}

/**
 * 统一历史列表：按接口返回顺序映射展示行
 * @note 排序在后端 listHistory（payPeriod DESC → updateTime DESC）；此处禁止再 sort，避免打乱契约
 */
export function mergeSalaryHistoryEntries(items: SalaryHistoryRecord[]): SalaryHistoryEntry[] {
  const verifyItems = items
    .map(toVerifyRecord)
    .filter((r): r is PayslipVerifyRecord => r != null)

  const entries: SalaryHistoryEntry[] = []
  for (const item of items) {
    if (item.historyType === 'calc') {
      entries.push(mapCalcHistoryEntry(item))
      continue
    }
    const verify = toVerifyRecord(item)
    if (verify)
      entries.push(mapVerifyHistoryEntry(verify, verifyItems))
  }
  return entries
}

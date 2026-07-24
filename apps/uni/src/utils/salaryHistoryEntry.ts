/**
 * 首页「最近记录」与历史列表共用的展示模型与标题拼装
 * 职责：把统一历史记录映射为列表行，保证两端文案与跳转一致
 * 适用：home.vue 最近记录、history.vue 合并列表
 */
import type { PayslipVerifyRecord, SalaryHistoryRecord } from '@/store/salaryHistory'
import { toCalcInput, toVerifyRecord } from '@/store/salaryHistory'
import dayjs from 'dayjs'
import { formatSalaryAmount } from '@/utils/formatSalaryAmount'
import { parsePayPeriod } from '@/utils/payPeriod'
import { computeVerifyForRecord, formatVerifyAbnormalSummary } from '@/utils/payslipVerify'
import { calcSalary } from '@/utils/salaryCalculator'

export { formatSalaryAmount } from '@/utils/formatSalaryAmount'

/** 行主题色：测算用主色，核对用成功色 */
export type SalaryHistoryEntryTheme = 'blue' | 'green'

/** 历史业务类型，对应后端 historyType */
export type SalaryHistoryEntryKind = 'calc' | 'verify'

/** 首页最近记录 / 历史列表共用的展示行模型 */
export interface SalaryHistoryEntry {
  /** 列表 key，含 kind 前缀避免两类 id 冲突 */
  key: string
  kind: SalaryHistoryEntryKind
  /** 业务记录 id（不含 kind 前缀） */
  id: string
  /** 主标题（含金额或差异摘要） */
  title: string
  /** 副标题：类型名 · MM-DD */
  subtitle: string
  /** 行主题色，驱动图标底与色点 */
  theme: SalaryHistoryEntryTheme
  /** wot-ui 图标名；空字符串时行组件不展示左侧图标区 */
  icon: string
  /** 点击跳转详情页路径 */
  url: string
  /** 用于排序的更新时间毫秒戳 */
  time: number
  /** 核对记录删除确认文案用，测算无此字段 */
  payPeriod?: string
}

/** 测算历史主标题：月薪 → 测算年薪 */
export function buildCalcHistoryTitle(item: SalaryHistoryRecord) {
  const annual = calcSalary(toCalcInput(item)).annualTakeHome
  return `月薪 ¥${formatSalaryAmount(item.preTaxMonthly)} → 税后年薪 ¥${formatSalaryAmount(annual)}`
}

/**
 * 核对历史主标题：月份 + 无差异/差异金额
 * @param allVerifyRecords 同年累计预扣依赖的全量核对记录，缺月会影响差异计算
 */
export function buildVerifyHistoryTitle(
  item: PayslipVerifyRecord,
  allVerifyRecords: PayslipVerifyRecord[],
) {
  const { month } = parsePayPeriod(item.payPeriod)
  const verify = computeVerifyForRecord(item, allVerifyRecords)
  const verifyText = verify.overallMatch ? '核对无误' : formatVerifyAbnormalSummary(verify)
  return `${month} 月工资条 · ${verifyText}`
}

/** 副标题：业务类型 + 更新日期（不含年份，列表场景够用） */
function buildSubtitle(kind: SalaryHistoryEntryKind, updateTime: string) {
  const typeLabel = kind === 'calc' ? '年薪测算' : '月薪核对'
  return `${typeLabel} · ${dayjs(updateTime).format('MM-DD')}`
}

/** 测算记录 → 统一展示行 */
export function mapCalcHistoryEntry(item: SalaryHistoryRecord): SalaryHistoryEntry {
  return {
    key: `calc-${item.id}`,
    kind: 'calc',
    id: item.id,
    title: buildCalcHistoryTitle(item),
    subtitle: buildSubtitle('calc', item.updateTime),
    theme: 'blue',
    icon: 'file',
    url: `/pages/salary/detail?id=${encodeURIComponent(item.id)}`,
    time: new Date(item.updateTime).getTime() || 0,
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
  return {
    key: `verify-${item.id}`,
    kind: 'verify',
    id: item.id,
    title: buildVerifyHistoryTitle(item, allVerifyRecords),
    subtitle: buildSubtitle('verify', item.updateTime),
    theme: 'green',
    icon: 'check-square',
    url: `/pages/salary/verify-detail?id=${encodeURIComponent(item.id)}`,
    time: new Date(item.updateTime).getTime() || 0,
    payPeriod: item.payPeriod,
  }
}

/**
 * 统一历史列表并按更新时间降序
 * @note 核对项映射时用全部 verify 子集，保证差异摘要与详情页一致
 */
export function mergeSalaryHistoryEntries(items: SalaryHistoryRecord[]): SalaryHistoryEntry[] {
  const verifyItems = items
    .map(toVerifyRecord)
    .filter((r): r is PayslipVerifyRecord => r != null)
  const calcEntries = items.filter(i => i.historyType === 'calc').map(mapCalcHistoryEntry)
  const verifyEntries = verifyItems.map(item => mapVerifyHistoryEntry(item, verifyItems))
  return [...calcEntries, ...verifyEntries].sort((a, b) => b.time - a.time)
}

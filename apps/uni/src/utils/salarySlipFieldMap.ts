/**
 * OCR 明细 → 月薪核对表单字段映射
 * 职责：按全等标签 + 正则/同义词匹配合计类行，写入 PayslipMappedFields
 * 适用：verify 页识别完成后自动回填
 *
 * 映射规则：
 * 1. 标签 trim 后全等（===）优先；命中则锁定该字段，弱规则不得再写
 * 2. 未锁定字段再走 totalPatterns，再 synonymPatterns；不做编辑距离
 * 3. 同优先级多行：合计类字段后写覆盖；其他扣款累加（补缴+缺勤可并存）
 * 4. 仅匹配「合计/个人」类标签；社保/公积金负向前瞻排除「公司|单位|企业|基数|补贴|补缴」
 * 5. 「社保补缴/补缴」归其他扣款，不进个人社保；缺勤等亦不进公积金
 * 6. unmappedItems 返回全量 clone，供用户手动指派未命中项
 */
import type { LineItem } from '@/types/salary-slip'
import { cloneDeep } from 'lodash-es'

/** 核对表单金额字段 key（含不进个税累计的其他扣款） */
export type PayslipFieldKey
  = | 'preTaxMonthly'
    | 'ssPersonalAmount'
    | 'hfPersonalAmount'
    | 'otherDeductionAmount'
    | 'specialDeductionMonthly'
    | 'personalIncomeTax'
    | 'postTaxMonthly'

/** 映射后的金额字段（单位元，两位小数） */
export interface PayslipMappedFields {
  /** 税前应发 */
  preTaxMonthly: number
  /** 个人社保合计 */
  ssPersonalAmount: number
  /** 个人公积金 */
  hfPersonalAmount: number
  /**
   * 其他扣款（缺勤、社保补缴等）：从累计收入扣减，不进专项扣除；实发自洽一并扣减
   * @note 勿把该项填进公积金，否则会扭曲个税反推
   */
  otherDeductionAmount: number
  /** 专项附加扣除（月） */
  specialDeductionMonthly: number
  /** 个人所得税 */
  personalIncomeTax: number
  /** 税后实发 */
  postTaxMonthly: number
}

export interface MapLineItemsResult {
  /** 命中规则写入的表单字段 */
  fields: PayslipMappedFields
  /** 原始明细全量（含已映射项），供手动指派 */
  unmappedItems: LineItem[]
}

interface FieldRule {
  key: PayslipFieldKey
  /** 规范全等标签（trim 后 ===）；命中即锁定字段 */
  exactLabels: string[]
  /** 优先匹配合计类标签（仅未锁定字段） */
  totalPatterns: RegExp[]
  /** 同义词弱匹配（精确/包含类正则，非编辑距离） */
  synonymPatterns?: RegExp[]
}

const FIELD_RULES: FieldRule[] = [
  {
    key: 'preTaxMonthly',
    exactLabels: ['应发工资', '应发薪金', '税前工资', '税前薪金', '工资总额', '税前合计', '应发总计', '应发合计', '税前月薪'],
    totalPatterns: [/应发(?:工资|薪金|合计)?$/, /税前(?:工资|薪金|合计)?$/, /工资总额$/, /税前合计$/, /应发总计$/],
    synonymPatterns: [/应发合计/, /应发金额/, /税前收入/, /应发数$/, /税前月薪/],
  },
  {
    key: 'ssPersonalAmount',
    // 全等只收当月个人社保合计；「社保补缴」走其他扣款
    exactLabels: ['社保', '五险', '个人社保', '个人五险', '社保合计', '个人社保合计', '五险合计'],
    // 排除单位缴存/基数/补贴/补缴行，避免补缴与单位缴误入个人社保
    totalPatterns: [
      /^(?!.*(?:公司|单位|企业|基数|补贴|补缴)).*(?:社保|五险)/,
      /^(?!.*(?:公司|单位|企业|基数|补贴|补缴))个人.*(?:社保|五险)/,
      /^(?!.*(?:公司|单位|企业|基数|补贴|补缴))(?:社保|五险).*个人/,
    ],
    synonymPatterns: [/^(?!.*(?:公司|单位|企业|基数|补贴|补缴)).*社保合计/, /个人社保合计/],
  },
  {
    key: 'hfPersonalAmount',
    exactLabels: ['公积金', '一金', '个人公积金', '个人一金', '公积金合计', '个人公积金合计'],
    totalPatterns: [
      /^(?!.*(?:公司|单位|企业|基数|补贴|补缴)).*(?:公积金|一金)/,
      /^(?!.*(?:公司|单位|企业|基数|补贴|补缴))个人.*(?:公积金|一金)/,
      /^(?!.*(?:公司|单位|企业|基数|补贴|补缴))(?:公积金|一金).*个人/,
    ],
    synonymPatterns: [/^(?!.*(?:公司|单位|企业|基数|补贴|补缴)).*公积金合计/, /个人公积金合计/],
  },
  {
    key: 'otherDeductionAmount',
    // 补缴与缺勤等同属非专项抵扣；勿与个人社保全等标签重叠
    exactLabels: ['社保补缴', '公积金补缴', '补缴', '其他扣款', '缺勤', '事假', '病假', '旷工', '应扣合计'],
    totalPatterns: [
      /^(?!.*(?:公积金|一金|个税|所得税)).*(?:缺勤|事假|病假|旷工|考勤).*/,
      /(?:社保|五险|公积金|一金)?补缴/,
      /其他扣款/,
      /应扣合计$/,
    ],
    synonymPatterns: [/缺勤扣款/, /事假扣款/, /病假扣款/, /考勤扣款/, /补缴款/],
  },
  {
    key: 'specialDeductionMonthly',
    exactLabels: ['专项附加扣除', '个税专项扣除', '附加扣除', '专项扣除', '专项附加'],
    totalPatterns: [/专项附加扣除/, /个税专项扣除/, /附加扣除/, /专项扣除/, /专项附加$/],
    synonymPatterns: [/专项附加合计/, /累计专项附加/],
  },
  {
    key: 'personalIncomeTax',
    exactLabels: ['个人所得税', '个税', '代扣个税', '所得税', '应交个税'],
    totalPatterns: [/个人所得税/, /个税/, /代扣个税/, /所得税/, /代扣代缴.*税/, /应交个税/],
    synonymPatterns: [/本月个税/, /扣缴个税/, /税金$/],
  },
  {
    key: 'postTaxMonthly',
    exactLabels: ['实发工资', '实发薪金', '税后工资', '税后薪金', '到手工资', '到手薪金', '实发合计', '实发金额', '税后实发', '实际发放'],
    totalPatterns: [/实发(?:工资|薪金|合计)?$/, /税后(?:工资|薪金)?$/, /到手(?:工资|薪金)?$/, /实发合计$/, /实发金额$/, /税后实发$/, /实际发放$/],
    synonymPatterns: [/实发数$/, /到手金额/, /实发月薪/, /税后收入/],
  },
]

function parseAmount(value: string): number | null {
  let normalized = value
    .trim()
    .replace(/\s/g, '')
    .replace(/[,，]/g, '')
    .replace(/[¥￥元]/g, '')
    .replace(/^−/, '-')

  const paren = normalized.match(/^[（(](.+)[）)]$/)
  if (paren)
    normalized = `-${paren[1]}`

  if (!normalized || normalized === '-')
    return null
  const num = Number(normalized)
  if (!Number.isFinite(num))
    return null
  return Math.round(num * 100) / 100
}

function matchRule(label: string, patterns: RegExp[]): boolean {
  const normalized = label.trim()
  if (!normalized)
    return false
  return patterns.some(p => p.test(normalized))
}

/** 标签 trim 后与规范全等列表任一 === */
function matchExactLabel(label: string, exactLabels: string[]): boolean {
  const normalized = label.trim()
  if (!normalized)
    return false
  return exactLabels.includes(normalized)
}

function emptyFields(): PayslipMappedFields {
  return {
    preTaxMonthly: 0,
    ssPersonalAmount: 0,
    hfPersonalAmount: 0,
    otherDeductionAmount: 0,
    specialDeductionMonthly: 0,
    personalIncomeTax: 0,
    postTaxMonthly: 0,
  }
}

/**
 * 写入映射字段：其他扣款累加，其余后写覆盖
 * @note 补缴与缺勤等可同时出现，覆盖会丢数；合计类字段仍以后出现为准
 */
function writeMappedAmount(fields: PayslipMappedFields, key: PayslipFieldKey, amount: number): void {
  if (key === 'otherDeductionAmount') {
    fields.otherDeductionAmount = Math.round((fields.otherDeductionAmount + amount) * 100) / 100
    return
  }
  fields[key] = amount
}

/**
 * 将 OCR 识别明细映射到月薪核对表单字段
 * @returns fields 自动回填值；unmappedItems 始终为入参深拷贝，便于手动指派
 * @note 全等命中锁定字段后，total/synonym 不再写入该字段
 */
export function mapLineItemsToPayslipFields(lineItems: LineItem[]): MapLineItemsResult {
  const fields = emptyFields()
  const lockedByExact = new Set<PayslipFieldKey>()

  // 1. 全等优先：命中即锁定；合计类后写覆盖，其他扣款累加
  for (const rule of FIELD_RULES) {
    for (const item of lineItems) {
      const label = item.key.trim()
      const amount = parseAmount(item.value)
      if (amount === null)
        continue
      if (!matchExactLabel(label, rule.exactLabels))
        continue
      writeMappedAmount(fields, rule.key, amount)
      lockedByExact.add(rule.key)
    }
  }

  // 2. 弱规则仅填未锁定字段；合计类后写覆盖，其他扣款累加
  for (const rule of FIELD_RULES) {
    if (lockedByExact.has(rule.key))
      continue

    for (const item of lineItems) {
      const label = item.key.trim()
      const amount = parseAmount(item.value)
      if (amount === null)
        continue

      if (matchRule(label, rule.totalPatterns)) {
        writeMappedAmount(fields, rule.key, amount)
        continue
      }
      if (rule.synonymPatterns?.length && matchRule(label, rule.synonymPatterns))
        writeMappedAmount(fields, rule.key, amount)
    }
  }

  return { fields, unmappedItems: cloneDeep(lineItems) }
}

/** 核对表单/列表展示用中文标签 */
export const PAYSLIP_FIELD_LABELS: Record<PayslipFieldKey, string> = {
  preTaxMonthly: '税前工资',
  ssPersonalAmount: '个人社保',
  hfPersonalAmount: '个人公积金',
  otherDeductionAmount: '其他扣款',
  specialDeductionMonthly: '专项附加扣除',
  personalIncomeTax: '个人所得税',
  postTaxMonthly: '税后工资',
}

/** 表单输入框占位；其他扣款需说明不含个税抵扣，避免再误填进公积金 */
export const PAYSLIP_FIELD_PLACEHOLDERS: Record<PayslipFieldKey, string> = {
  preTaxMonthly: '0',
  ssPersonalAmount: '选填',
  hfPersonalAmount: '选填',
  otherDeductionAmount: '非专项抵扣，如缺勤等',
  specialDeductionMonthly: '选填',
  personalIncomeTax: '0',
  postTaxMonthly: '0',
}

/**
 * OCR 明细 → 月薪核对表单 6 字段映射
 * 职责：按标签正则匹配合计类行，写入 PayslipMappedFields
 * 适用：verify 页识别完成后自动回填
 *
 * 映射规则：
 * 1. 仅匹配「合计/个人」类标签，不把明细行误当社保公积金总额
 * 2. 社保/公积金用负向前瞻排除「公司|单位|企业|基数|补贴」，避免单位缴与补贴行
 * 3. 同字段多行后写覆盖先写（后出现的合计更贴近「最终应发」）
 * 4. unmappedItems 返回全量 clone，供用户手动指派未命中项
 */
import type { LineItem } from '@/types/salary-slip'
import { cloneDeep } from 'lodash-es'

/** 核对表单 6 个金额字段 key */
export type PayslipFieldKey = 'preTaxMonthly' | 'ssPersonalAmount' | 'hfPersonalAmount' | 'specialDeductionMonthly' | 'personalIncomeTax' | 'postTaxMonthly'

/** 映射后的金额字段（单位元，两位小数） */
export interface PayslipMappedFields {
  /** 税前应发 */
  preTaxMonthly: number
  /** 个人社保合计 */
  ssPersonalAmount: number
  /** 个人公积金 */
  hfPersonalAmount: number
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
  /** 优先匹配合计类标签 */
  totalPatterns: RegExp[]
}

const FIELD_RULES: FieldRule[] = [
  {
    key: 'preTaxMonthly',
    totalPatterns: [/应发(?:工资|薪金|合计)?$/, /税前(?:工资|薪金|合计)?$/, /工资总额$/, /税前合计$/, /应发总计$/],
  },
  {
    key: 'ssPersonalAmount',
    // 排除单位缴存/基数/补贴行，只收个人社保合计
    totalPatterns: [/^(?!.*(?:公司|单位|企业|基数|补贴)).*(?:社保|五险)/, /个人.*(?:社保|五险)/, /(?:社保|五险).*个人/],
  },
  {
    key: 'hfPersonalAmount',
    totalPatterns: [
      /^(?!.*(?:公司|单位|企业|基数|补贴)).*(?:公积金|一金)/,
      /个人.*(?:公积金|一金)/,
      /(?:公积金|一金).*个人/,
    ],
  },
  {
    key: 'specialDeductionMonthly',
    totalPatterns: [/专项附加扣除/, /个税专项扣除/, /附加扣除/, /专项扣除/, /专项附加$/],
  },
  {
    key: 'personalIncomeTax',
    totalPatterns: [/个人所得税/, /个税/, /代扣个税/, /所得税/, /代扣代缴.*税/, /应交个税/],
  },
  {
    key: 'postTaxMonthly',
    totalPatterns: [/实发(?:工资|薪金|合计)?$/, /税后(?:工资|薪金)?$/, /到手(?:工资|薪金)?$/, /实发合计$/, /实发金额$/, /税后实发$/, /实际发放$/],
  },
]

function parseAmount(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '-')
    return null
  const num = Number(trimmed.replace(/,/g, ''))
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

function emptyFields(): PayslipMappedFields {
  return {
    preTaxMonthly: 0,
    ssPersonalAmount: 0,
    hfPersonalAmount: 0,
    specialDeductionMonthly: 0,
    personalIncomeTax: 0,
    postTaxMonthly: 0,
  }
}

/**
 * 将 OCR 识别明细映射到月薪核对 6 字段
 * @returns fields 自动回填值；unmappedItems 始终为入参深拷贝，便于手动指派
 */
export function mapLineItemsToPayslipFields(lineItems: LineItem[]): MapLineItemsResult {
  const fields = emptyFields()

  for (const rule of FIELD_RULES) {
    lineItems.forEach((item) => {
      const label = item.key.trim()
      const amount = parseAmount(item.value)
      if (amount === null)
        return

      if (matchRule(label, rule.totalPatterns)) {
        fields[rule.key] = amount
        return
      }
    })
  }

  return { fields, unmappedItems: cloneDeep(lineItems) }
}

/** 核对表单/列表展示用中文标签 */
export const PAYSLIP_FIELD_LABELS: Record<PayslipFieldKey, string> = {
  preTaxMonthly: '税前工资',
  ssPersonalAmount: '个人社保',
  hfPersonalAmount: '个人公积金',
  specialDeductionMonthly: '专项附加扣除',
  personalIncomeTax: '个人所得税',
  postTaxMonthly: '税后工资',
}

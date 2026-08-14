/**
 * 核对差异主因判定
 * 职责：按固定优先级输出一句话主因、推荐动作与「修改工资条」场景副文案
 * 适用：verify-detail 结论卡副文；不替代操作轨按钮，只强化「为什么 + 先做什么」
 * @note 文案面向小白：统一用「报税收入」，少用「申报 / 自洽 / 累计」等术语
 */
import type { PayslipVerifyRecord } from '@/store/salaryHistory'
import type { PayslipVerifyResult } from '@/utils/salaryCalculator'
import { formatSalaryAmount } from '@/utils/formatSalaryAmount'

/** 主因类型（优先级见 resolveVerifyCause） */
export type VerifyCauseKind
  = | 'match'
    | 'report_bias'
    | 'post_tax_only'
    | 'tax_only_no_infer'
    | 'both_diff'
    | 'declared_residual'

/** 主因推荐动作：与详情现有 CTA 对齐；补缺月不在详情引导 */
export type VerifyCauseAction
  = | 'none'
    | 'confirm_inferred'
    | 'reverify'

/** 主因视图模型 */
export interface VerifyCause {
  kind: VerifyCauseKind
  /** 一句话主因（结论卡副文） */
  summary: string
  action: VerifyCauseAction
  /** 「修改工资条」场景化副文案；非 reverify 时也可给默认 */
  reverifyHint: string
}

export interface ResolveVerifyCauseInput {
  verify: PayslipVerifyResult
  record: PayslipVerifyRecord
  /** 与详情 canConfirmInferred 一致 */
  canConfirmInferred: boolean
}

/**
 * 按优先级解析差异主因
 * 1 可反推报税收入 → 2 仅税后 → 3 仅个税且反推失败 → 4 两项都差 → 5 已按报税口径仍有差
 * @note 缺月补齐只在首页进度卡引导；税后公式验算已从详情移除，主因白话即可
 */
export function resolveVerifyCause(input: ResolveVerifyCauseInput): VerifyCause {
  const { verify: v, record, canConfirmInferred } = input

  if (v.overallMatch) {
    return {
      kind: 'match',
      summary: '个税和税后都对得上',
      action: 'none',
      reverifyHint: '改金额后重新计算',
    }
  }

  // 缺月不在此引导：补缺月只走首页进度卡，详情只呈现当月核对结论
  if (canConfirmInferred && v.inferredPreTax != null && v.reportBias) {
    const biasText = v.reportBias === 'under' ? '偏低' : '偏高'
    return {
      kind: 'report_bias',
      // 金额只出现在主 CTA 副文，避免结论卡重复挤两遍
      summary: `个税对不上，报税收入可能比工资条${biasText === '偏低' ? '低' : '高'}`,
      action: 'confirm_inferred',
      reverifyHint: '改金额后重算',
    }
  }

  if (record.useInferredForCumulative) {
    return {
      kind: 'declared_residual',
      summary: '已按报税收入计算；和工资条仍可能有差',
      action: 'reverify',
      reverifyHint: '可改回工资条口径，或修正条上金额',
    }
  }

  if (v.taxMatch && !v.postTaxMatch) {
    const sign = v.postTaxDiff > 0 ? '多' : '少'
    return {
      kind: 'post_tax_only',
      summary: `工资条上的数字加起来对不上税后，可能${sign}了 ¥${formatSalaryAmount(Math.abs(v.postTaxDiff))}`,
      action: 'reverify',
      reverifyHint: '优先核对：其他扣款、税后、应发',
    }
  }

  if (!v.taxMatch && v.postTaxMatch) {
    if (v.inferredPreTax == null && v.calcMode === 'history') {
      return {
        kind: 'tax_only_no_infer',
        summary: '个税对不上，请核对专项附加或五险一金',
        action: 'reverify',
        reverifyHint: '优先核对：专项附加扣除、五险一金',
      }
    }
    const sign = v.taxDiff > 0 ? '多' : '少'
    return {
      kind: 'tax_only_no_infer',
      summary: `个税可能${sign}扣了 ¥${formatSalaryAmount(Math.abs(v.taxDiff))}`,
      action: 'reverify',
      reverifyHint: '优先核对：专项附加扣除、五险一金',
    }
  }

  return {
    kind: 'both_diff',
    summary: '个税和税后都有差，建议先把工资条数据改准',
    action: 'reverify',
    reverifyHint: '先核对应发、扣款、个税、税后是否对得上',
  }
}

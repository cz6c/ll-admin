/**
 * 薪资测算与工资条累计预扣核对
 * 职责：年薪测算（calcSalary）、累计预扣明细、工资条个税/税后核对、个税差异时反推申报应发
 * 适用：测算页、核对页、历史摘要与详情
 *
 * 流程概览：按用户填写的社保/公积金个缴额 → 算五险一金个人月缴额 → 按累计预扣法算 12 个月个税与税后
 * → 年终奖单独计税或并入综合所得 → 汇总年度到手与税额。
 */

import { parsePayPeriod } from '@/utils/payPeriod'

/**
 * 年终奖计税方式：
 * - none：不计年终奖税
 * - separate：单独计税
 * - merge：并入综合所得
 */
export type YearEndTaxMode = 'none' | 'separate' | 'merge'

/** 用户输入的薪资与参保参数，用于一次完整测算 */
export interface SalaryCalcInput {
  /** 每月税前固定工资，本模型按 12 个月相同月薪计算 */
  preTaxMonthly: number
  /** 年终奖计税方式：none 不计税 / separate 单独计税 / merge 并入综合所得 */
  yearEndTaxMode: YearEndTaxMode
  /** 年终奖税前金额，为 0 表示无年终奖 */
  yearEndBonus: number
  /** 五险个人部分月缴合计 */
  ssPersonalAmount: number
  /** 公积金个人月缴额 */
  hfPersonalAmount: number
  /** 每月专项附加扣除合计，将多项简化为月度固定额参与累计预扣 */
  specialDeductionMonthly: number
}

/** 单月薪资明细（与累计预扣法下该月一致） */
export interface MonthlySalaryRow {
  /** 公历月份 1–12 */
  month: number
  /** 该月税前工资，与输入月薪一致 */
  preTax: number
  /**
   * 五险一金个人缴纳（本月，元）。累计预扣时与专项附加扣除一并从累计税前收入中减除后，再按税率表算个税；
   * 本模型各月相同，数值上等于 `SalaryCalcResult.fiveInsFundPersonalMonthly`。
   */
  fiveInsFundPersonal: number
  /** 该月预扣个人所得税，即「本期应预扣预缴税额」 */
  tax: number
  /** 该月税后实发：税前 − 五险一金个人 − 个税 */
  postTax: number
}

/** 一次测算的完整输出：月度明细、年度汇总与年终奖 */
export interface SalaryCalcResult {
  /** 五险一金个人缴纳月度合计，与累计预扣专项扣除中的「三险一金」部分一致 */
  fiveInsFundPersonalMonthly: number
  /** 当年税后现金流合计：12 个月税后工资 + 年终奖税后（单独计税时年终奖一次性计入） */
  annualTakeHome: number
  /** 当年个人所得税合计：12 个月工资预扣个税 + 年终奖个税 */
  annualTaxTotal: number
  /** 税前应发总额：12 个月税前月薪 + 年终奖税前 */
  annualPreTaxTotal: number
  /** 年末累计预扣预缴应纳税所得额（工资部分，不含年终奖并入调整） */
  annualTaxableIncome: number
  /** 年末适用预扣率（0–1），取 12 月累计所得档位 */
  applicableTaxRate: number
  /** 年末档位对应速算扣除数（元） */
  quickDeduction: number
  /** 12 个月的税前、个税、税后明细行；各月个税之和即工资部分预扣总额 */
  monthlyRows: MonthlySalaryRow[]

  /** 五险个人部分每月合计，不含公积金 */
  ssPersonalMonthly: number
  /** 公积金个人每月缴存额 */
  hfPersonalMonthly: number

  /** 年终奖应缴个人所得税，无年终奖时为 0 */
  yearEndBonusTax: number
  /** 年终奖税后到手：税前年终奖 − 年终奖个税 */
  yearEndBonusNet: number
}

/** 累计预扣税率档：max 档位上限（含）、rate 预扣率、quick 速算扣除数 */
const SALARY_TAX_TIERS = [
  { max: 36000, rate: 0.03, quick: 0 },
  { max: 144000, rate: 0.1, quick: 2520 },
  { max: 300000, rate: 0.2, quick: 16920 },
  { max: 420000, rate: 0.25, quick: 31920 },
  { max: 660000, rate: 0.3, quick: 52920 },
  { max: 960000, rate: 0.35, quick: 85920 },
  { max: Infinity, rate: 0.45, quick: 181920 },
] as const

/**
 * 按累计预扣预缴应纳税所得额查预扣率档位。
 * 累计应预扣预缴税额 = 应纳税所得额 × 预扣率 − 速算扣除数
 * @returns tax 累计应预扣税额；rate/quick 为命中档位的预扣率与速算扣除数
 */
function resolveSalaryTaxTier(cumulativeWithholdingTaxableIncome: number): {
  /** 累计应预扣预缴税额（未 round） */
  tax: number
  /** 预扣率 */
  rate: number
  /** 速算扣除数 */
  quick: number
} {
  if (cumulativeWithholdingTaxableIncome <= 0)
    return { tax: 0, rate: 0, quick: 0 }
  for (const t of SALARY_TAX_TIERS) {
    if (cumulativeWithholdingTaxableIncome <= t.max) {
      return {
        tax: cumulativeWithholdingTaxableIncome * t.rate - t.quick,
        rate: t.rate,
        quick: t.quick,
      }
    }
  }
  return { tax: 0, rate: 0, quick: 0 }
}

/**
 * 工资薪金累计预扣：按「累计预扣预缴应纳税所得额」适用综合所得七级超额累进，
 * 计算截至本月末的 **累计应预扣预缴税额**。
 *
 * @param cumulativeWithholdingTaxableIncome 累计预扣预缴应纳税所得额
 */
function cumulativeSalaryTax(cumulativeWithholdingTaxableIncome: number): number {
  return resolveSalaryTaxTier(cumulativeWithholdingTaxableIncome).tax
}

/**
 * 年终奖「单独计税」：将奖金除以 12 的数额对照月度换算表得税率与速算扣除，再按一次性奖金公式计税。
 * @param bonus 年终奖税前金额
 */
function yearEndBonusSeparateTax(bonus: number): number {
  if (bonus <= 0)
    return 0
  /** 按月换算后的数额（非实际月薪，仅用于查表） */
  const m = bonus / 12
  /** 国税函〔2005〕9 号思路：以「奖金÷12」对照月度税率表 */
  const table: { max: number, rate: number, deduct: number }[] = [
    { max: 3000, rate: 0.03, deduct: 0 },
    { max: 12000, rate: 0.1, deduct: 210 },
    { max: 25000, rate: 0.2, deduct: 1410 },
    { max: 35000, rate: 0.25, deduct: 2660 },
    { max: 55000, rate: 0.3, deduct: 4410 },
    { max: 80000, rate: 0.35, deduct: 7160 },
    { max: Infinity, rate: 0.45, deduct: 15160 },
  ]
  for (const row of table) {
    if (m <= row.max)
      return Math.max(0, bonus * row.rate - row.deduct)
  }
  return 0
}

/** 金额四舍五入到分，与月缴额、税额口径一致 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * 根据输入测算税前月薪、五险一金与专项附加扣除，按累计预扣法计算全年工资个税及税后现金流，并处理年终奖。
 * @param input 工资、社保公积金与扣除项等
 * @returns 含月度明细、年度汇总等完整结果
 */
export function calcSalary(input: SalaryCalcInput): SalaryCalcResult {
  /** ---------- 1. 五险与公积金个人月缴额 ---------- */
  const ssPersonalMonthly = round2(Math.max(0, input.ssPersonalAmount || 0))
  const hfPersonalMonthly = round2(Math.max(0, input.hfPersonalAmount || 0))
  const fiveInsFundPersonalMonthly = round2(ssPersonalMonthly + hfPersonalMonthly)

  /**
   * ---------- 2. 工资薪金：累计预扣预缴（与税法公式对齐） ----------
   *
   * 本期应预扣预缴税额 =（累计预扣预缴应纳税所得额 × 预扣率 − 速算扣除数）− 累计已预扣预缴税额
   *
   * 累计预扣预缴应纳税所得额 = 累计收入 − 累计免税收入 − 累计减除费用 − 累计专项扣除 − 累计专项附加扣除 − 累计依法确定的其他扣除
   * 其中：累计减除费用 = 5000 元/月 × 纳税人当年截至本月在本单位的任职受雇月份数（本模型即「本月序号 month」）。
   *
   * 本实现：累计免税收入、其他扣除按 0；累计收入 = 税前月薪 × month；
   * 累计专项扣除 = 五险一金个人月缴 × month；累计专项附加扣除 = specialDeductionMonthly × month。
   */
  const monthlyRows: MonthlySalaryRow[] = []
  /** 累计已预扣预缴税额（即截至上月末的累计应预扣税额） */
  let cumulativeTaxAlreadyWithheld = 0
  /** 12 月末累计应纳税所得额与档位，供明细页「适用税率 / 速算扣除」展示 */
  let yearEndTaxableIncome = 0
  let yearEndTaxRate = 0
  let yearEndQuickDeduction = 0
  for (let month = 1; month <= 12; month++) {
    /** 累计收入（本模型为各月相同税前月薪的累计） */
    const cumulativeIncome = input.preTaxMonthly * month
    /** 累计免税收入（本模型未配置，按 0） */
    const cumulativeTaxExemptIncome = 0
    /** 累计减除费用：5000 元/月 × 截至本月任职受雇月份数 */
    const cumulativeStandardDeduction = 5000 * month
    /** 累计专项扣除：基本养老保险、基本医疗保险、失业保险等个人部分 + 住房公积金个人部分（本模型为月固定额 × month） */
    const cumulativeSpecialDeduction = fiveInsFundPersonalMonthly * month
    /** 累计专项附加扣除 */
    const cumulativeSpecialAdditionalDeduction = input.specialDeductionMonthly * month
    /** 累计依法确定的其他扣除（本模型未配置，按 0） */
    const cumulativeOtherLawfulDeduction = 0

    /** 累计预扣预缴应纳税所得额 */
    const cumulativeWithholdingTaxableIncome = cumulativeIncome
      - cumulativeTaxExemptIncome
      - cumulativeStandardDeduction
      - cumulativeSpecialDeduction
      - cumulativeSpecialAdditionalDeduction
      - cumulativeOtherLawfulDeduction

    /** 截至本月末：累计应预扣预缴税额 = 累计预扣预缴应纳税所得额 × 预扣率 − 速算扣除数 */
    const tier = resolveSalaryTaxTier(cumulativeWithholdingTaxableIncome)
    const cumulativeTaxPayableThroughThisMonth = tier.tax
    /** 本期应预扣预缴税额 = 累计应预扣预缴税额 − 累计已预扣预缴税额 */
    const currentPeriodWithholdingTax = round2(Math.max(0, cumulativeTaxPayableThroughThisMonth - cumulativeTaxAlreadyWithheld))
    cumulativeTaxAlreadyWithheld = cumulativeTaxPayableThroughThisMonth

    if (month === 12) {
      yearEndTaxableIncome = Math.max(0, cumulativeWithholdingTaxableIncome)
      yearEndTaxRate = tier.rate
      yearEndQuickDeduction = tier.quick
    }

    /** 当月税后实发 = 税前月薪 − 五险一金个人 − 本期应预扣预缴税额 */
    const post = round2(input.preTaxMonthly - fiveInsFundPersonalMonthly - currentPeriodWithholdingTax)
    monthlyRows.push({
      month,
      preTax: input.preTaxMonthly,
      fiveInsFundPersonal: fiveInsFundPersonalMonthly,
      tax: currentPeriodWithholdingTax,
      postTax: post,
    })
  }

  /** ---------- 3. 年终奖个税（单独计税 / 并入综合所得） ---------- */
  /** 近似：每月在减除 5000、五险一金个人、专项附加后的应纳税所得额相同，×12 作为年度工资部分应纳税所得额（并入年终奖时用） */
  const monthlyTaxableApprox = Math.max(0, input.preTaxMonthly - 5000 - fiveInsFundPersonalMonthly - input.specialDeductionMonthly)
  const annualSalaryTaxable = monthlyTaxableApprox * 12
  let yearEndBonusTax = 0
  if (input.yearEndBonus > 0) {
    if (input.yearEndTaxMode === 'separate')
      yearEndBonusTax = round2(yearEndBonusSeparateTax(input.yearEndBonus))
    else if (input.yearEndTaxMode === 'merge')
      /** 并入：对（工资部分 + 奖金）累计计税 − 仅工资部分累计税额 */
      yearEndBonusTax = round2(Math.max(0, cumulativeSalaryTax(annualSalaryTaxable + input.yearEndBonus) - cumulativeSalaryTax(annualSalaryTaxable)))
    else
      yearEndBonusTax = 0
  }
  const yearEndBonusNet = round2(Math.max(0, input.yearEndBonus - yearEndBonusTax))

  /** ---------- 4. 年度汇总：到手、工资个税 + 年终奖个税 ---------- */
  const sumMonthlyNet = monthlyRows.reduce((s, row) => s + row.postTax, 0)
  const annualTakeHome = round2(sumMonthlyNet + yearEndBonusNet)
  const salaryTaxTotal = monthlyRows.reduce((s, row) => s + row.tax, 0)
  const annualTaxTotal = round2(salaryTaxTotal + yearEndBonusTax)
  const annualPreTaxTotal = round2(input.preTaxMonthly * 12 + Math.max(0, input.yearEndBonus || 0))

  /** ---------- 5. 返回完整测算结果 ---------- */
  return {
    fiveInsFundPersonalMonthly,
    annualTakeHome,
    annualTaxTotal,
    annualPreTaxTotal,
    annualTaxableIncome: round2(yearEndTaxableIncome),
    applicableTaxRate: yearEndTaxRate,
    quickDeduction: yearEndQuickDeduction,
    monthlyRows,
    ssPersonalMonthly,
    hfPersonalMonthly,
    yearEndBonusTax,
    yearEndBonusNet,
  }
}

/** 金额比对容差（元）；分位四舍五入后仍可能有 0.01 级浮点差 */
const VERIFY_TOLERANCE = 0.01

/** 单月工资快照（用于累计预扣，不含工资条个税/税后） */
export interface PayslipMonthSnapshot {
  /** 税前应发月薪（展示口径；计税收入见 otherDeductionAmount） */
  preTaxMonthly: number
  /** 个人社保合计 */
  ssPersonalAmount: number
  /** 个人公积金 */
  hfPersonalAmount: number
  /**
   * 其他扣款（缺勤等）：从累计收入中扣减，不计入专项扣除
   * @note 已确认的申报应发快照应置 0（申报收入已是计税口径）
   */
  otherDeductionAmount?: number
  /** 专项附加扣除（月） */
  specialDeductionMonthly: number
}

/** 累计预扣明细（详情页展示用；未建模项固定为 0） */
export interface WithholdingBreakdown {
  /** 累计收入 */
  cumulativeIncome: number
  /** 累计免税收入，本模型为 0 */
  cumulativeTaxExemptIncome: number
  /** 累计减除费用 */
  cumulativeStandardDeduction: number
  /** 累计专项扣除：五险一金个人部分累计 */
  cumulativeSpecialDeduction: number
  /** 累计专项附加扣除 */
  cumulativeSpecialAdditionalDeduction: number
  /** 累计其他扣除，本模型为 0 */
  cumulativeOtherDeduction: number
  /** 累计个人养老金，本模型为 0 */
  cumulativePersonalPension: number
  /** 累计准予扣除的捐赠额，本模型为 0 */
  cumulativeDonationDeduction: number
  /** 累计应纳税所得额 */
  cumulativeTaxableIncome: number
  /** 预扣率（小数，如 0.03） */
  taxRate: number
  /** 速算扣除数 */
  quickDeduction: number
  /** 累计应纳税额 / 累计应预扣预缴税额 */
  cumulativeTaxPayable: number
  /** 累计已缴税额：截至上月末累计应预扣 */
  cumulativeTaxPaid: number
  /** 累计减免税额，本模型为 0 */
  cumulativeTaxReduction: number
  /** 本期申报税额 / 本期应预扣预缴税额 */
  currentPeriodTax: number
}

/** 空明细模板；months 为空时直接返回其浅拷贝 */
const EMPTY_BREAKDOWN: WithholdingBreakdown = {
  cumulativeIncome: 0,
  cumulativeTaxExemptIncome: 0,
  cumulativeStandardDeduction: 0,
  cumulativeSpecialDeduction: 0,
  cumulativeSpecialAdditionalDeduction: 0,
  cumulativeOtherDeduction: 0,
  cumulativePersonalPension: 0,
  cumulativeDonationDeduction: 0,
  cumulativeTaxableIncome: 0,
  taxRate: 0,
  quickDeduction: 0,
  cumulativeTaxPayable: 0,
  cumulativeTaxPaid: 0,
  cumulativeTaxReduction: 0,
  currentPeriodTax: 0,
}

/**
 * 按可变月薪逐月累计预扣，返回最后一月的完整明细。
 * 累计收入 = Σ(应发 − 其他扣款)；其他扣款不进专项扣除（与公积金/社保分开）。
 */
export function calcWithholdingBreakdownForMonths(months: PayslipMonthSnapshot[]): WithholdingBreakdown {
  if (!months.length)
    return { ...EMPTY_BREAKDOWN }

  let cumulativeTaxAlreadyWithheld = 0
  let cumulativeIncome = 0
  let cumulativeStandardDeduction = 0
  let cumulativeSpecialDeduction = 0
  let cumulativeSpecialAdditionalDeduction = 0
  let last: WithholdingBreakdown = { ...EMPTY_BREAKDOWN }

  for (const m of months) {
    const fiveInsFundPersonal = round2(
      Math.max(0, m.ssPersonalAmount || 0) + Math.max(0, m.hfPersonalAmount || 0),
    )
    const otherDeduction = Math.max(0, m.otherDeductionAmount || 0)
    // 缺勤等：减计税收入，不是专项附加/公积金类抵扣
    cumulativeIncome += Math.max(0, m.preTaxMonthly - otherDeduction)
    cumulativeStandardDeduction += 5000
    cumulativeSpecialDeduction += fiveInsFundPersonal
    cumulativeSpecialAdditionalDeduction += m.specialDeductionMonthly || 0

    const cumulativeTaxExemptIncome = 0
    const cumulativeOtherDeduction = 0
    const cumulativePersonalPension = 0
    const cumulativeDonationDeduction = 0
    const cumulativeTaxReduction = 0

    const cumulativeTaxableIncome
      = cumulativeIncome
        - cumulativeTaxExemptIncome
        - cumulativeStandardDeduction
        - cumulativeSpecialDeduction
        - cumulativeSpecialAdditionalDeduction
        - cumulativeOtherDeduction
        - cumulativePersonalPension
        - cumulativeDonationDeduction

    const tier = resolveSalaryTaxTier(cumulativeTaxableIncome)
    /** 与 calcSalary / 原 calcCumulativeTaxForMonth 一致：累计税额不先 round，本期税额 round2 */
    const cumulativeTaxPayable = Math.max(0, tier.tax)
    const currentPeriodTax = round2(Math.max(0, cumulativeTaxPayable - cumulativeTaxAlreadyWithheld))

    last = {
      cumulativeIncome: round2(cumulativeIncome),
      cumulativeTaxExemptIncome,
      cumulativeStandardDeduction: round2(cumulativeStandardDeduction),
      cumulativeSpecialDeduction: round2(cumulativeSpecialDeduction),
      cumulativeSpecialAdditionalDeduction: round2(cumulativeSpecialAdditionalDeduction),
      cumulativeOtherDeduction,
      cumulativePersonalPension,
      cumulativeDonationDeduction,
      cumulativeTaxableIncome: round2(Math.max(0, cumulativeTaxableIncome)),
      taxRate: tier.rate,
      quickDeduction: tier.quick,
      cumulativeTaxPayable: round2(cumulativeTaxPayable),
      cumulativeTaxPaid: round2(cumulativeTaxAlreadyWithheld),
      cumulativeTaxReduction,
      currentPeriodTax,
    }
    cumulativeTaxAlreadyWithheld = cumulativeTaxPayable
  }

  return last
}

/**
 * 按可变月薪逐月累计预扣，返回最后一月的个税与税后
 * @returns tax 本期个税；postTax 税前−五险一金−个税；fiveInsFundPersonal 最后一月五险一金个人
 */
export function calcCumulativeTaxForMonth(months: PayslipMonthSnapshot[]): {
  /** 本期应预扣预缴税额 */
  tax: number
  /** 最后一月税后实发 */
  postTax: number
  /** 最后一月五险一金个人合计 */
  fiveInsFundPersonal: number
} {
  if (!months.length) {
    return { tax: 0, postTax: 0, fiveInsFundPersonal: 0 }
  }
  const breakdown = calcWithholdingBreakdownForMonths(months)
  const last = months[months.length - 1]!
  const fiveInsFundPersonal = round2(
    Math.max(0, last.ssPersonalAmount || 0) + Math.max(0, last.hfPersonalAmount || 0),
  )
  return {
    tax: breakdown.currentPeriodTax,
    postTax: round2(
      last.preTaxMonthly
      - fiveInsFundPersonal
      - Math.max(0, last.otherDeductionAmount || 0)
      - breakdown.currentPeriodTax,
    ),
    fiveInsFundPersonal,
  }
}

/** 工资条核对输入（用户填写/识别的工资条字段） */
export interface PayslipVerifyInput {
  /** 工资所属月份 YYYY-MM */
  payPeriod: string
  /** 税前应发月薪 */
  preTaxMonthly: number
  /** 个人社保合计 */
  ssPersonalAmount: number
  /** 个人公积金 */
  hfPersonalAmount: number
  /**
   * 其他扣款（缺勤等）：从累计收入中扣减，不进专项扣除；实发自洽时一并扣减
   * @note 勿填进公积金，否则会当专项扣除扭曲个税
   */
  otherDeductionAmount: number
  /** 专项附加扣除（月） */
  specialDeductionMonthly: number
  /** 工资条上的个人所得税（与重算值比对） */
  personalIncomeTax: number
  /** 工资条上的税后工资（与「税前−社保公积金−其他扣款−个税」自洽值比对） */
  postTaxMonthly: number
}

/** 申报应发相对工资条：under 少报 / over 多报 */
export type SalaryReportBias = 'under' | 'over'

/**
 * 工资条核对结果
 * 差异口径：工资条值 − 重算期望值；正数表示工资条偏高（可能多扣/多发）
 */
export interface PayslipVerifyResult {
  /** 按累计预扣法重算的本期个税 */
  expectedTax: number
  /** 由工资条字段自洽推出的税后应发：税前 − 社保 − 公积金 − 其他扣款 − 个税 */
  expectedPostTax: number
  /** 个税差异 = 工资条个税 − expectedTax */
  taxDiff: number
  /** 税后差异 = 工资条税后 − expectedPostTax */
  postTaxDiff: number
  /** 个税是否在容差内一致 */
  taxMatch: boolean
  /** 税后是否在容差内一致 */
  postTaxMatch: boolean
  /** 个税与税后均匹配 */
  overallMatch: boolean
  /**
   * history：用已录入前序月份累计预扣；
   * ideal：前序月按当月快照理想推算（或缺月时降级）
   */
  calcMode: 'history' | 'ideal'
  /** ideal 模式下缺失的前序月份（1..M-1） */
  missingPriorMonths?: number[]
  /**
   * 个税不一致且 history 模式下反推的申报口径应发；失败或未反推为 null
   * @note 仅供 UI；落库须用户确认 useInferredForCumulative
   */
  inferredPreTax: number | null
  /** 相对工资条应发的少报/多报；无反推为 null */
  reportBias: SalaryReportBias | null
  /** 工资条应发 − 反推应发；正数表示条上更高（少报额度） */
  inferredDelta: number | null
}

/** 核对输入 → 累计预扣用的月份快照（去掉工资条个税/税后） */
function toMonthSnapshot(input: Pick<
  PayslipVerifyInput,
  'preTaxMonthly' | 'ssPersonalAmount' | 'hfPersonalAmount' | 'otherDeductionAmount' | 'specialDeductionMonthly'
>): PayslipMonthSnapshot {
  return {
    preTaxMonthly: input.preTaxMonthly,
    ssPersonalAmount: input.ssPersonalAmount,
    hfPersonalAmount: input.hfPersonalAmount,
    otherDeductionAmount: input.otherDeductionAmount,
    specialDeductionMonthly: input.specialDeductionMonthly,
  }
}

/** 税后应发：税前 − 社保 − 公积金 − 其他扣款 − 个税 */
function expectedPostTaxFromSlip(input: PayslipVerifyInput): number {
  return round2(
    input.preTaxMonthly
    - input.ssPersonalAmount
    - input.hfPersonalAmount
    - Math.max(0, input.otherDeductionAmount || 0)
    - input.personalIncomeTax,
  )
}

/**
 * 在固定 prior 与本月扣除项下，求使本期应扣 ≈ targetTax 的本月税前应发（申报计税收入口径）。
 * 税率平台多解时取与 slipPreTax 最接近者；与工资条几乎相等则视为非应发口径问题，返回 null。
 *
 * @note 反推搜索的是计税收入本身，当月 otherDeduction 不参与（由调用方在 prior 快照中扣减）。
 *       缺勤等填「其他扣款」会从累计收入扣减，勿填进公积金专项。
 */
export function inferPreTaxFromTax(params: {
  priorMonths: PayslipMonthSnapshot[]
  currentDeductions: Omit<PayslipMonthSnapshot, 'preTaxMonthly'>
  targetTax: number
  slipPreTax: number
}): { inferredPreTax: number, reportBias: SalaryReportBias } | null {
  const { priorMonths, currentDeductions, targetTax, slipPreTax } = params
  const tol = VERIFY_TOLERANCE

  const taxAt = (preTax: number): number => {
    const months: PayslipMonthSnapshot[] = [
      ...priorMonths,
      {
        preTaxMonthly: preTax,
        ssPersonalAmount: currentDeductions.ssPersonalAmount,
        hfPersonalAmount: currentDeductions.hfPersonalAmount,
        specialDeductionMonthly: currentDeductions.specialDeductionMonthly,
      },
    ]
    return calcWithholdingBreakdownForMonths(months).currentPeriodTax
  }

  let hi = Math.max(Math.abs(slipPreTax) * 2, 10_000)
  while (taxAt(hi) < targetTax - tol && hi < 5_000_000)
    hi *= 2

  if (taxAt(hi) < targetTax - tol)
    return null

  let left = 0
  let right = hi
  let found: number | null = null
  for (let i = 0; i < 80; i++) {
    const mid = (left + right) / 2
    const t = taxAt(mid)
    if (Math.abs(t - targetTax) <= tol) {
      found = mid
      break
    }
    if (t < targetTax)
      left = mid
    else
      right = mid
  }

  if (found == null) {
    for (const candidate of [0, hi, slipPreTax, left, right]) {
      if (Math.abs(taxAt(candidate) - targetTax) <= tol) {
        found = candidate
        break
      }
    }
  }
  if (found == null)
    return null

  // 平台区间：向两侧扩到仍满足税额容差，再取距工资条应发最近的 round2 点
  let pLo = found
  let pHi = found
  let loBound = 0
  let hiBound = found
  for (let i = 0; i < 40; i++) {
    const mid = (loBound + hiBound) / 2
    if (Math.abs(taxAt(mid) - targetTax) <= tol) {
      pLo = mid
      hiBound = mid
    }
    else {
      loBound = mid
    }
  }
  loBound = found
  hiBound = hi
  for (let i = 0; i < 40; i++) {
    const mid = (loBound + hiBound) / 2
    if (Math.abs(taxAt(mid) - targetTax) <= tol) {
      pHi = mid
      loBound = mid
    }
    else {
      hiBound = mid
    }
  }

  let best = round2(found)
  let bestDist = Math.abs(best - slipPreTax)
  for (let i = 0; i <= 50; i++) {
    const x = round2(pLo + (pHi - pLo) * (i / 50))
    if (Math.abs(taxAt(x) - targetTax) > tol)
      continue
    const d = Math.abs(x - slipPreTax)
    if (d < bestDist) {
      best = x
      bestDist = d
    }
  }

  if (Math.abs(best - slipPreTax) <= tol)
    return null
  if (Math.abs(taxAt(best) - targetTax) > tol)
    return null

  const reportBias: SalaryReportBias = best < slipPreTax - tol ? 'under' : 'over'
  return { inferredPreTax: best, reportBias }
}

/**
 * 组装核对结果：用重算个税与工资条字段算差异，再按 VERIFY_TOLERANCE 判定是否匹配
 * @param expectedTax 累计预扣得到的本期个税
 * @param priorMonths history 模式下的前序快照；用于个税差异时反推申报应发
 */
function buildVerifyResult(
  input: PayslipVerifyInput,
  expectedTax: number,
  calcMode: 'history' | 'ideal',
  missingPriorMonths?: number[],
  priorMonths: PayslipMonthSnapshot[] = [],
): PayslipVerifyResult {
  const expectedPostTax = expectedPostTaxFromSlip(input)
  const taxDiff = round2(input.personalIncomeTax - expectedTax)
  const postTaxDiff = round2(input.postTaxMonthly - expectedPostTax)
  const taxMatch = Math.abs(taxDiff) <= VERIFY_TOLERANCE
  const postTaxMatch = Math.abs(postTaxDiff) <= VERIFY_TOLERANCE

  let inferredPreTax: number | null = null
  let reportBias: SalaryReportBias | null = null
  let inferredDelta: number | null = null

  // 仅完整历史链反推：ideal/缺月时反推不可靠，避免误导用户确认
  if (!taxMatch && calcMode === 'history') {
    const inferred = inferPreTaxFromTax({
      priorMonths,
      currentDeductions: {
        ssPersonalAmount: input.ssPersonalAmount,
        hfPersonalAmount: input.hfPersonalAmount,
        specialDeductionMonthly: input.specialDeductionMonthly,
      },
      targetTax: input.personalIncomeTax,
      slipPreTax: input.preTaxMonthly,
    })
    if (inferred) {
      inferredPreTax = inferred.inferredPreTax
      reportBias = inferred.reportBias
      inferredDelta = round2(input.preTaxMonthly - inferred.inferredPreTax)
    }
  }

  return {
    expectedTax,
    expectedPostTax,
    taxDiff,
    postTaxDiff,
    taxMatch,
    postTaxMatch,
    overallMatch: taxMatch && postTaxMatch,
    calcMode,
    missingPriorMonths,
    inferredPreTax,
    reportBias,
    inferredDelta,
  }
}

/** 核对结果 + 累计预扣明细（详情页） */
export interface PayslipVerifyBreakdownResult {
  /** 个税/税后比对结果 */
  verify: PayslipVerifyResult
  /** 截至当月的累计预扣公式拆解 */
  breakdown: WithholdingBreakdown
}

/** 累计预扣核对选项：前序历史 + 可选当月计税快照覆盖 */
export interface PayslipVerifyOptions {
  /** 同年 1..M-1 月的历史快照（不含当月） */
  priorMonths?: PayslipMonthSnapshot[]
  /** 同年 1..M-1 中缺失的月份序号；非空则走 ideal */
  missingPriorMonths?: number[]
  /**
   * 当月计税快照；缺省从 input 推导
   * @note 已确认申报应发时由适配层传入有效应发，input 仍保留工资条字段供税后自洽比对
   */
  currentMonth?: PayslipMonthSnapshot
}

/**
 * 决定累计预扣用「真实前序历史」还是「当月参数理想复制 1..M」
 * history：缺月为空且 prior 条数恰好为 M-1；否则降级 ideal
 */
function resolveVerifyMode(
  input: PayslipVerifyInput,
  options?: PayslipVerifyOptions,
): {
  /** 参与累计预扣的 1..M 月序列 */
  months: PayslipMonthSnapshot[]
  calcMode: 'history' | 'ideal'
  missingPriorMonths?: number[]
} {
  const { month } = parsePayPeriod(input.payPeriod)
  const missing = options?.missingPriorMonths ?? []
  const prior = options?.priorMonths ?? []
  // 允许覆盖当月计税口径（申报确认后），不改动 input 上的工资条比对字段
  const current = options?.currentMonth ?? toMonthSnapshot(input)
  const useHistory = missing.length === 0 && prior.length === month - 1

  if (useHistory) {
    return {
      months: [...prior, current],
      calcMode: 'history',
    }
  }

  /** 理想模型：当月录入参数按固定月薪复制 1..M 月 */
  const months = Array.from({ length: month }, () => ({ ...current }))
  return {
    months,
    calcMode: 'ideal',
    missingPriorMonths: month > 1 && missing.length > 0 ? missing : undefined,
  }
}

/** 按累计预扣法核对工资条个税；有完整前序历史时用真实月薪累计，否则理想模型 */
export function verifyPayslipTax(
  input: PayslipVerifyInput,
  options?: PayslipVerifyOptions,
): PayslipVerifyResult {
  const resolved = resolveVerifyMode(input, options)
  const breakdown = calcWithholdingBreakdownForMonths(resolved.months)
  const priorForInfer = resolved.calcMode === 'history'
    ? (options?.priorMonths ?? [])
    : []
  return buildVerifyResult(
    input,
    breakdown.currentPeriodTax,
    resolved.calcMode,
    resolved.missingPriorMonths,
    priorForInfer,
  )
}

/** 核对结果 + 累计预扣明细；分支规则与 verifyPayslipTax 一致 */
export function verifyPayslipTaxBreakdown(
  input: PayslipVerifyInput,
  options?: PayslipVerifyOptions,
): PayslipVerifyBreakdownResult {
  const resolved = resolveVerifyMode(input, options)
  const breakdown = calcWithholdingBreakdownForMonths(resolved.months)
  const priorForInfer = resolved.calcMode === 'history'
    ? (options?.priorMonths ?? [])
    : []
  return {
    verify: buildVerifyResult(
      input,
      breakdown.currentPeriodTax,
      resolved.calcMode,
      resolved.missingPriorMonths,
      priorForInfer,
    ),
    breakdown,
  }
}

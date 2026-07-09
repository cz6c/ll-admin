/**
 *
 * 流程概览：按用户填写的社保/公积金个缴额 → 算五险一金个人月缴额 → 按累计预扣法算 12 个月个税与税后
 * → 年终奖单独计税或并入综合所得 → 汇总年度到手与税额。
 */

import { parsePayPeriod } from '@/utils/payPeriod'

/** 年终奖计税方式：单独计税 | 并入综合所得 */
export type YearEndTaxMode = 'none' | 'separate' | 'merge'

/** 用户输入的薪资与参保参数，用于一次完整测算 */
export interface SalaryCalcInput {
  /** 每月税前固定工资（元），本模型按 12 个月相同月薪计算 */
  preTaxMonthly: number
  /** 年终奖计税方式：`separate` 单独计税，`merge` 并入当年综合所得 */
  yearEndTaxMode: YearEndTaxMode
  /** 年终奖税前金额（元），为 0 表示无年终奖 */
  yearEndBonus: number
  /** 五险个人部分月缴合计（元） */
  ssPersonalAmount: number
  /** 公积金个人月缴额（元） */
  hfPersonalAmount: number
  /** 每月专项附加扣除合计（元），将多项简化为月度固定额参与累计预扣 */
  specialDeductionMonthly: number
}

/** 单月薪资明细（与累计预扣法下该月一致） */
export interface MonthlySalaryRow {
  /** 公历月份 1–12 */
  month: number
  /** 该月税前工资（元），与输入月薪一致 */
  preTax: number
  /**
   * 五险一金个人缴纳（本月，元）。累计预扣时与专项附加扣除一并从累计税前收入中减除后，再按税率表算个税；
   * 本模型各月相同，数值上等于 `SalaryCalcResult.fiveInsFundPersonalMonthly`。
   */
  fiveInsFundPersonal: number
  /** 该月预扣个人所得税（元），即「本期应预扣预缴税额」 */
  tax: number
  /** 该月税后实发（元）：税前 − 五险一金个人 − 个税 */
  postTax: number
}

/** 一次测算的完整输出：月度明细、年度汇总与年终奖 */
export interface SalaryCalcResult {
  /** 五险一金个人缴纳月度合计（元），与累计预扣专项扣除中的「三险一金」部分一致 */
  fiveInsFundPersonalMonthly: number
  /** 当年税后现金流合计（元）：12 个月税后工资 + 年终奖税后（单独计税时年终奖一次性计入） */
  annualTakeHome: number
  /** 当年个人所得税合计（元）：12 个月工资预扣个税 + 年终奖个税 */
  annualTaxTotal: number
  /** 12 个月的税前、个税、税后明细行；各月个税之和即工资部分预扣总额 */
  monthlyRows: MonthlySalaryRow[]

  /** 五险个人部分每月合计（元），不含公积金 */
  ssPersonalMonthly: number
  /** 公积金个人每月缴存额（元） */
  hfPersonalMonthly: number

  /** 年终奖应缴个人所得税（元），无年终奖时为 0 */
  yearEndBonusTax: number
  /** 年终奖税后到手（元）：税前年终奖 − 年终奖个税 */
  yearEndBonusNet: number
}

/**
 * 工资薪金累计预扣：按「累计预扣预缴应纳税所得额」适用综合所得七级超额累进，
 * 计算截至本月末的 **累计应预扣预缴税额**。
 *
 * 即：累计应预扣预缴税额 = 累计预扣预缴应纳税所得额 × 预扣率 − 速算扣除数
 * （预扣率、速算扣除数按累计额落入的级距确定，与居民个人工资薪金预扣预缴税率表一致。）
 *
 * @param cumulativeWithholdingTaxableIncome 累计预扣预缴应纳税所得额（元）
 */
function cumulativeSalaryTax(cumulativeWithholdingTaxableIncome: number): number {
  if (cumulativeWithholdingTaxableIncome <= 0)
    return 0
  /** 各档累计应纳税所得额上限（元）及预扣率、速算扣除数 */
  const tiers = [
    { max: 36000, rate: 0.03, quick: 0 },
    { max: 144000, rate: 0.1, quick: 2520 },
    { max: 300000, rate: 0.2, quick: 16920 },
    { max: 420000, rate: 0.25, quick: 31920 },
    { max: 660000, rate: 0.3, quick: 52920 },
    { max: 960000, rate: 0.35, quick: 85920 },
    { max: Infinity, rate: 0.45, quick: 181920 },
  ]
  for (const t of tiers) {
    if (cumulativeWithholdingTaxableIncome <= t.max)
      return cumulativeWithholdingTaxableIncome * t.rate - t.quick
  }
  return 0
}

/**
 * 年终奖「单独计税」：将奖金除以 12 的数额对照月度换算表得税率与速算扣除，再按一次性奖金公式计税。
 * @param bonus 年终奖税前金额（元）
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
    const cumulativeTaxPayableThroughThisMonth = cumulativeSalaryTax(cumulativeWithholdingTaxableIncome)
    /** 本期应预扣预缴税额 = 累计应预扣预缴税额 − 累计已预扣预缴税额 */
    const currentPeriodWithholdingTax = round2(Math.max(0, cumulativeTaxPayableThroughThisMonth - cumulativeTaxAlreadyWithheld))
    cumulativeTaxAlreadyWithheld = cumulativeTaxPayableThroughThisMonth

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

  /** ---------- 5. 返回完整测算结果 ---------- */
  return {
    fiveInsFundPersonalMonthly,
    annualTakeHome,
    annualTaxTotal,
    monthlyRows,
    ssPersonalMonthly,
    hfPersonalMonthly,
    yearEndBonusTax,
    yearEndBonusNet,
  }
}

const VERIFY_TOLERANCE = 0.01

/** 单月工资快照（用于累计预扣，不含工资条个税/税后） */
export interface PayslipMonthSnapshot {
  preTaxMonthly: number
  ssPersonalAmount: number
  hfPersonalAmount: number
  specialDeductionMonthly: number
}

/** 按可变月薪逐月累计预扣，返回最后一月的个税与税后 */
export function calcCumulativeTaxForMonth(months: PayslipMonthSnapshot[]): {
  tax: number
  postTax: number
  fiveInsFundPersonal: number
} {
  if (!months.length) {
    return { tax: 0, postTax: 0, fiveInsFundPersonal: 0 }
  }
  let cumulativeTaxAlreadyWithheld = 0
  let cumulativeIncome = 0
  let cumulativeStandardDeduction = 0
  let cumulativeSpecialDeduction = 0
  let cumulativeSpecialAdditionalDeduction = 0
  let lastTax = 0
  let lastPostTax = 0
  let lastFiveIns = 0

  for (const m of months) {
    const fiveInsFundPersonal = round2(
      Math.max(0, m.ssPersonalAmount || 0) + Math.max(0, m.hfPersonalAmount || 0),
    )
    cumulativeIncome += m.preTaxMonthly
    cumulativeStandardDeduction += 5000
    cumulativeSpecialDeduction += fiveInsFundPersonal
    cumulativeSpecialAdditionalDeduction += m.specialDeductionMonthly || 0

    const cumulativeWithholdingTaxableIncome = cumulativeIncome
      - cumulativeStandardDeduction
      - cumulativeSpecialDeduction
      - cumulativeSpecialAdditionalDeduction

    const cumulativeTaxPayable = cumulativeSalaryTax(cumulativeWithholdingTaxableIncome)
    lastTax = round2(Math.max(0, cumulativeTaxPayable - cumulativeTaxAlreadyWithheld))
    cumulativeTaxAlreadyWithheld = cumulativeTaxPayable
    lastPostTax = round2(m.preTaxMonthly - fiveInsFundPersonal - lastTax)
    lastFiveIns = fiveInsFundPersonal
  }

  return { tax: lastTax, postTax: lastPostTax, fiveInsFundPersonal: lastFiveIns }
}

/** 工资条核对输入 */
export interface PayslipVerifyInput {
  /** 工资所属月份 YYYY-MM */
  payPeriod: string
  preTaxMonthly: number
  ssPersonalAmount: number
  hfPersonalAmount: number
  specialDeductionMonthly: number
  /** 工资条上的个人所得税（元） */
  personalIncomeTax: number
  /** 工资条上的税后工资（元） */
  postTaxMonthly: number
}

/** 工资条核对结果 */
export interface PayslipVerifyResult {
  expectedTax: number
  expectedPostTax: number
  taxDiff: number
  postTaxDiff: number
  taxMatch: boolean
  postTaxMatch: boolean
  overallMatch: boolean
  calcMode: 'history' | 'ideal'
  /** ideal 模式下缺失的前序月份（1..M-1） */
  missingPriorMonths?: number[]
}

function toMonthSnapshot(input: Pick<PayslipVerifyInput, 'preTaxMonthly' | 'ssPersonalAmount' | 'hfPersonalAmount' | 'specialDeductionMonthly'>): PayslipMonthSnapshot {
  return {
    preTaxMonthly: input.preTaxMonthly,
    ssPersonalAmount: input.ssPersonalAmount,
    hfPersonalAmount: input.hfPersonalAmount,
    specialDeductionMonthly: input.specialDeductionMonthly,
  }
}

function buildVerifyResult(
  input: PayslipVerifyInput,
  expectedTax: number,
  expectedPostTax: number,
  calcMode: 'history' | 'ideal',
  missingPriorMonths?: number[],
): PayslipVerifyResult {
  const taxDiff = round2(input.personalIncomeTax - expectedTax)
  const postTaxDiff = round2(input.postTaxMonthly - expectedPostTax)
  const taxMatch = Math.abs(taxDiff) <= VERIFY_TOLERANCE
  const postTaxMatch = Math.abs(postTaxDiff) <= VERIFY_TOLERANCE
  return {
    expectedTax,
    expectedPostTax,
    taxDiff,
    postTaxDiff,
    taxMatch,
    postTaxMatch,
    overallMatch: taxMatch,
    calcMode,
    missingPriorMonths,
  }
}

/** 按累计预扣法核对工资条个税；有完整前序历史时用真实月薪累计，否则理想模型 */
export function verifyPayslipTax(
  input: PayslipVerifyInput,
  options?: {
    /** 同年 1..M-1 月的历史快照（不含当月） */
    priorMonths?: PayslipMonthSnapshot[]
    missingPriorMonths?: number[]
  },
): PayslipVerifyResult {
  const { month } = parsePayPeriod(input.payPeriod)
  const missing = options?.missingPriorMonths ?? []
  const prior = options?.priorMonths ?? []
  const current = toMonthSnapshot(input)
  const useHistory = missing.length === 0 && prior.length === month - 1

  if (useHistory) {
    const { tax, postTax } = calcCumulativeTaxForMonth([...prior, current])
    return buildVerifyResult(input, tax, postTax, 'history')
  }

  const calcResult = calcSalary({
    preTaxMonthly: input.preTaxMonthly,
    yearEndTaxMode: 'none',
    yearEndBonus: 0,
    ssPersonalAmount: input.ssPersonalAmount,
    hfPersonalAmount: input.hfPersonalAmount,
    specialDeductionMonthly: input.specialDeductionMonthly,
  })
  const row = calcResult.monthlyRows[month - 1]
  return buildVerifyResult(
    input,
    row.tax,
    row.postTax,
    'ideal',
    month > 1 && missing.length > 0 ? missing : undefined,
  )
}

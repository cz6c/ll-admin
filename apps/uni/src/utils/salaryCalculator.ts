/**
 *
 * 流程概览：解析社保/公积金个人缴费基数或个缴额 → 算五险与公积金个人月缴额 → 按累计预扣法算 12 个月个税与税后
 * → 年终奖单独计税或并入综合所得 → 汇总年度到手与税额。
 */

import { getSalaryCityName } from '@/constants/salaryCityPicker'

/** 年终奖计税方式：单独计税 | 并入综合所得 */
export type YearEndTaxMode = 'none' | 'separate' | 'merge'
/** 社保计算方式：按基数比例 | 按个缴金额（直接填五险个人合计，不按比例） */
export type SsPaymentType = 'base' | 'custom'
/** 公积金计算方式：不缴纳 | 按基数比例 | 按个缴金额（直接填个人月缴，不按比例） */
export type HfPaymentType = 'none' | 'base' | 'custom'

export interface CityProfile {
  /** 城市 id，与选择器、输入里的 cityId 对应 */
  id: string
  /** 展示用城市名 */
  name: string
  /** 社保公积金缴费基数下限（参考当地最低工资或政策说明） */
  ssBaseMin: number
  /** 缴费基数上限（简化：取常见上限，实际以当地为准） */
  ssBaseCap: number
  /** 个人比例：养老、医疗、失业 */
  ssPersonalRates: { pension: number, medical: number, unemployment: number }
}

/** 内置城市参保参数表（当前仅深圳一条完整数据） */
export const CITY_LIST: CityProfile[] = [
  {
    id: 'shenzhen',
    name: '深圳市',
    ssBaseMin: 4775,
    // ssBaseMin1: 6727,
    // ssBaseMin2: 2520,
    ssBaseCap: 27549,
    ssPersonalRates: { pension: 0.08, medical: 0.02, unemployment: 0.002 },
  },
]

/**
 * 按 cityId 取参保模板：在 `CITY_LIST` 中命中则返回该条；否则用深圳比例 + `getSalaryCityName` 展示名拼一条近似配置。
 */
export function getCityProfile(cityId: string): CityProfile {
  const hit = CITY_LIST.find(c => c.id === cityId)
  if (hit)
    return hit
  const t = CITY_LIST[0]
  return {
    id: cityId,
    name: getSalaryCityName(cityId) || cityId,
    ssBaseMin: t.ssBaseMin,
    ssBaseCap: t.ssBaseCap,
    ssPersonalRates: { ...t.ssPersonalRates },
  }
}

/** 用户输入的薪资与参保参数，用于一次完整测算 */
export interface SalaryCalcInput {
  /** 参保城市 id，用于取缴费比例与基数上下限 */
  cityId: string
  /** 每月税前固定工资（元），本模型按 12 个月相同月薪计算 */
  preTaxMonthly: number
  /** 年终奖计税方式：`separate` 单独计税，`merge` 并入当年综合所得 */
  yearEndTaxMode: YearEndTaxMode
  /** 年终奖税前金额（元），为 0 表示无年终奖 */
  yearEndBonus: number
  /** 社保计算方式：`base` 按基数比例，`custom` 按个缴金额 */
  ssPaymentType: SsPaymentType
  /** 社保缴费基数（元），仅 `ssPaymentType === 'base'` 时参与比例计算 */
  ssBase: number
  /** 五险个人部分月缴合计（元），仅 `ssPaymentType === 'custom'` 时生效 */
  ssPersonalAmount: number
  /** 公积金计算方式，见 `HfPaymentType` */
  hfPaymentType: HfPaymentType
  /** 公积金缴存比例（小数，如 0.12）；仅 `hfPaymentType === 'base'` 时使用 */
  hfRate: number
  /** 公积金缴费基数（元），仅 `hfPaymentType === 'base'` 时使用 */
  hfBase: number
  /** 公积金个人月缴额（元），仅 `hfPaymentType === 'custom'` 时生效 */
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

/** 一次测算的完整输出：基数、月度明细、年度汇总与年终奖 */
export interface SalaryCalcResult {
  /** 实际采用的参保城市参数（比例、基数上下限等） */
  city: CityProfile
  /**
   * 核算后的社保缴费基数（元），仅 `ssPaymentType === 'base'` 时有值（夹在上下限）；
   * `custom`（按个缴金额）时为 0。
   */
  resolvedSsBase: number
  /** 核算后的公积金缴费基数（元），不缴公积金时为 0 */
  resolvedHfBase: number
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
  /** 公积金个人每月缴存额（元），不缴时为 0 */
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
 * 社保个人缴费基数：`base` 时为用户基数夹在政策上下限；`custom` 时不按基数计，返回 0。
 */
function resolveSsBase(input: SalaryCalcInput, city: CityProfile): number {
  const floor = city.ssBaseMin
  const cap = city.ssBaseCap
  if (input.ssPaymentType === 'custom')
    return 0
  return Math.min(Math.max(input.ssBase || floor, floor), cap)
}

/** 公积金缴费基数：`base` 时夹在上下限；不缴或个缴时为 0 */
function resolveHfBase(input: SalaryCalcInput, city: CityProfile): number {
  if (input.hfPaymentType === 'none' || input.hfPaymentType === 'custom')
    return 0
  const floor = city.ssBaseMin
  const cap = city.ssBaseCap
  return Math.min(Math.max(input.hfBase || floor, floor), cap)
}

/**
 * 根据输入测算税前月薪、五险一金与专项附加扣除，按累计预扣法计算全年工资个税及税后现金流，并处理年终奖。
 * @param input 城市、工资、社保公积金与扣除项等
 * @returns 含月度明细、年度汇总等完整结果
 */
export function calcSalary(input: SalaryCalcInput): SalaryCalcResult {
  /** ---------- 1. 城市与缴费基数 ---------- */
  const city = getCityProfile(input.cityId)
  const resolvedSsBase = resolveSsBase(input, city)
  const resolvedHfBase = resolveHfBase(input, city)
  const ssBase = resolvedSsBase
  const hfBase = resolvedHfBase
  const r = city.ssPersonalRates

  /** ---------- 2. 五险与公积金个人月缴额 ---------- */
  /** 五险个人：养老 + 医疗 + 失业；个缴模式为直接取值 */
  const ssPersonalMonthly = input.ssPaymentType === 'custom'
    ? round2(Math.max(0, input.ssPersonalAmount || 0))
    : round2(
        ssBase * (r.pension + r.medical + r.unemployment),
      )
  const hfPersonalMonthly = input.hfPaymentType === 'none'
    ? 0
    : input.hfPaymentType === 'custom'
      ? round2(Math.max(0, input.hfPersonalAmount || 0))
      : round2(hfBase * input.hfRate)

  /** ---------- 3. 五险一金个人月缴额（与专项附加扣除一并参与累计预扣中的「扣除」侧） ---------- */
  const fiveInsFundPersonalMonthly = round2(ssPersonalMonthly + hfPersonalMonthly)

  /**
   * ---------- 4. 工资薪金：累计预扣预缴（与税法公式对齐） ----------
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

  /** ---------- 5. 年终奖个税（单独计税 / 并入综合所得） ---------- */
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

  /** ---------- 6. 年度汇总：到手、工资个税 + 年终奖个税 ---------- */
  const sumMonthlyNet = monthlyRows.reduce((s, row) => s + row.postTax, 0)
  const annualTakeHome = round2(sumMonthlyNet + yearEndBonusNet)
  const salaryTaxTotal = monthlyRows.reduce((s, row) => s + row.tax, 0)
  const annualTaxTotal = round2(salaryTaxTotal + yearEndBonusTax)

  /** ---------- 7. 返回完整测算结果 ---------- */
  return {
    city,
    resolvedSsBase: ssBase,
    resolvedHfBase: hfBase,
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

<script lang="ts" setup>
/**
 * 月薪核对历史详情：结论卡（原因+操作）→ 项目对比 → 折叠计算/原始数据。
 * 主流程：详情接口 → 页面本地 item + relatedVerifyList → 累计预扣重算（不写列表 store）
 * 差异态：同时只一条主 CTA；补缺月只走首页进度卡；缺月仅一行口径说明
 * 拉新：微信转发落到核对页（带 from），标题仅结论不带金额
 */
import type { PayslipVerifyRecord } from '@/store/salaryHistory'
import type { PayslipFieldKey } from '@/utils/salarySlipFieldMap'
import { onLoad, onShareAppMessage, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { getSalaryHistoryDetail } from '@/api/salary-verify'
import { toHistoryRecord, toVerifyRecord, useSalaryHistoryStore } from '@/store/salaryHistory'
import { buildFromQuery, DEFAULT_SHARE_FROM } from '@/utils/channelFrom'
import { formatSalaryAmount } from '@/utils/formatSalaryAmount'
import { SHARE_POSTER_URL } from '@/utils/lionAssets'
import { parsePayPeriod } from '@/utils/payPeriod'
import { computeVerifyBreakdown } from '@/utils/payslipVerify'
import { PAYSLIP_FIELD_LABELS } from '@/utils/salarySlipFieldMap'
import { resolveVerifyCause } from '@/utils/salaryVerifyCause'
import { buildVerifyReentryQuery } from '@/utils/verifyReentry'

defineOptions({ name: 'SalaryVerifyDetail' })

definePage({
  style: {
    navigationBarTitleText: '工资条识别核对·明细',
  },
})

const historyId = ref('')
const loadFailed = ref(false)
/** 首屏拉取中：有数据前不闪空态 */
const loading = ref(true)
/** 确认/改回申报口径写入中 */
const inferredSaving = ref(false)
/** 当前核对记录（页面态） */
const record = ref<PayslipVerifyRecord | null>(null)
/** 同年核对列表，仅供本页累计预扣，不进 store.items */
const relatedVerifyList = ref<PayslipVerifyRecord[]>([])
const salaryHistoryStore = useSalaryHistoryStore()

const fieldKeys: PayslipFieldKey[] = [
  'preTaxMonthly',
  'ssPersonalAmount',
  'hfPersonalAmount',
  'otherDeductionAmount',
  'specialDeductionMonthly',
  'personalIncomeTax',
  'postTaxMonthly',
]

onLoad((options?: Record<string, string>) => {
  historyId.value = options?.id ? decodeURIComponent(options.id) : ''
  // #ifdef MP-WEIXIN
  uni.showShareMenu({ withShareTicket: true })
  // #endif
})

/**
 * 拉取详情；失败只走可恢复空态（返回/重试），不再 toast 叠一层
 * @param options.silent 已有内容时不切全页 loading（确认申报口径后的原地刷新）
 */
async function fetchDetail(options?: { silent?: boolean }) {
  if (!historyId.value) {
    loadFailed.value = true
    record.value = null
    relatedVerifyList.value = []
    loading.value = false
    return
  }
  const silent = Boolean(options?.silent) && record.value != null
  if (!silent)
    loading.value = true
  loadFailed.value = false
  try {
    const detail = await getSalaryHistoryDetail(Number(historyId.value))
    const main = toVerifyRecord(toHistoryRecord(detail.item))
    if (!main) {
      loadFailed.value = true
      record.value = null
      relatedVerifyList.value = []
      return
    }
    record.value = main
    relatedVerifyList.value = (detail.relatedVerifyList ?? [])
      .map(row => toVerifyRecord(toHistoryRecord(row)))
      .filter((r): r is PayslipVerifyRecord => r != null)
  }
  catch {
    loadFailed.value = true
    record.value = null
    relatedVerifyList.value = []
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  void fetchDetail()
})

function retryLoad() {
  void fetchDetail()
}

const detail = computed(() => {
  if (!record.value)
    return null
  return computeVerifyBreakdown(record.value, relatedVerifyList.value)
})

const verify = computed(() => detail.value?.verify ?? null)
const breakdown = computed(() => detail.value?.breakdown ?? null)

/**
 * ideal 缺月口径说明：白话告知怎么估的，不引导去补（补月走首页进度卡）
 * @example 少了 3、5 月的工资条，前面月份先按本月来估
 */
const calcModeHint = computed(() => {
  const v = verify.value
  if (!v || v.calcMode !== 'ideal')
    return ''
  const missing = v.missingPriorMonths
  if (missing && missing.length > 0) {
    const shown = missing.slice(0, 3)
    const rest = missing.length - shown.length
    let months = shown.join('、')
    if (rest > 0)
      months += `…等 ${missing.length} 月`
    else
      months += ' 月'
    return `少了 ${months}的工资条，前面月份先按本月来估`
  }
  return '前面月份的工资条不全，先按本月来估'
})

/**
 * 拉新转发：标题只写结论不带金额；封面用固定海报，避免截屏泄密；落地核对页 + from
 */
onShareAppMessage(() => {
  const v = verify.value
  let title = '发薪了？30 秒核对工资条扣款对不对'
  if (v) {
    title = v.overallMatch ? '我刚核对了工资条：核对一致' : '我刚核对了工资条：存在差异'
  }
  return {
    title,
    path: `/pages/salary/verify?${buildFromQuery(DEFAULT_SHARE_FROM)}`,
    imageUrl: SHARE_POSTER_URL,
  }
})

/** 可展示「按申报口径继续核对」：反推成功且尚未确认沿用 */
const canConfirmInferred = computed(() => {
  const v = verify.value
  const row = record.value
  if (!v || !row || row.useInferredForCumulative)
    return false
  return !v.taxMatch && v.inferredPreTax != null && v.reportBias != null
})

/**
 * 差异主因：固定优先级一句话 + 推荐动作；写入结论卡副文
 * @note 缺月不在此引导，补缺月只走首页进度卡
 */
const verifyCause = computed(() => {
  const v = verify.value
  const row = record.value
  if (!v || !row)
    return null
  return resolveVerifyCause({
    verify: v,
    record: row,
    canConfirmInferred: canConfirmInferred.value,
  })
})

/** 已确认沿用：可改回工资条累计 */
const canRevertInferred = computed(() => Boolean(record.value?.useInferredForCumulative))

/** 主因动作：同时只强调一条主 CTA（不含补缺月） */
const primaryCauseAction = computed(() => verifyCause.value?.action ?? 'none')

const showConfirmInferredPrimary = computed(() => primaryCauseAction.value === 'confirm_inferred')
/** 无更高优先级时，「修改工资条」升为主 CTA */
const showReverifyPrimary = computed(() => primaryCauseAction.value === 'reverify')
/** 有主 CTA 时「修改工资条」降为次链；已按 App 口径时仍可改条 */
const showReverifySecondary = computed(() =>
  showConfirmInferredPrimary.value || canRevertInferred.value,
)

/** 结论卡底部操作轨：差异或已沿用 App 口径 */
const showActionRail = computed(() => {
  if (!verify.value)
    return false
  return !verify.value.overallMatch || canRevertInferred.value
})

/** 主 CTA 副文案：只留金额，原因已在结论卡 */
const confirmActionSub = computed(() => {
  const v = verify.value
  if (!v?.inferredPreTax)
    return '后续月份按报税收入计算'
  return `估你报税约 ¥${formatSalaryAmount(v.inferredPreTax)}`
})

/** 确认报税收入：二次确认弹层（默认可改系统估算应发） */
const showInferredConfirm = ref(false)
/** 弹层内申报收入输入（字符串便于 digit 输入） */
const inferredEditText = ref('')
/** 打开弹层后聚焦输入，强化「可改」感知 */
const inferredInputFocus = ref(false)
const popupZIndex = 1100

/** 「修改工资条」场景化副文案 */
const reverifyActionSub = computed(() => verifyCause.value?.reverifyHint ?? '改金额后重新计算')

/** 弹层对照：工资条应发（只读上下文） */
const inferredConfirmSlipText = computed(() => {
  const slip = record.value?.preTaxMonthly
  if (slip == null)
    return '—'
  return formatSalaryAmount(slip)
})

/** 打开确认框，带入系统反推值 */
function openInferredConfirm() {
  const v = verify.value
  if (!v?.inferredPreTax || !v.reportBias || inferredSaving.value)
    return
  inferredEditText.value = String(v.inferredPreTax)
  inferredInputFocus.value = false
  showInferredConfirm.value = true
  // 弹层入场后再 focus，避免小程序弹层未挂载时 focus 无效
  setTimeout(() => {
    if (showInferredConfirm.value)
      inferredInputFocus.value = true
  }, 280)
}

function closeInferredConfirm() {
  if (inferredSaving.value)
    return
  inferredInputFocus.value = false
  showInferredConfirm.value = false
}

/** digit 输入统一成字符串，避免小程序事件值类型漂移 */
function onInferredEditInput(e: { detail?: { value?: string } }) {
  inferredEditText.value = String(e.detail?.value ?? '')
}

/**
 * 用户确认后把（可改的）申报收入写入后端：当月累计与后续月 prior 均按此计税
 * @note 分位平台无法唯一反推，故以用户确认为准
 */
async function submitConfirmedInferred() {
  const row = record.value
  const v = verify.value
  if (!row || !v?.reportBias || inferredSaving.value)
    return
  const amount = Math.round(Number(inferredEditText.value) * 100) / 100
  if (!Number.isFinite(amount) || amount < 0) {
    uni.showToast({ title: '请输入有效金额', icon: 'none' })
    return
  }
  if (Math.abs(amount - row.preTaxMonthly) <= 0.01) {
    uni.showToast({ title: '与工资条应发相同，无需继续', icon: 'none' })
    return
  }
  const reportBias = amount < row.preTaxMonthly - 0.01 ? 'under' : 'over'
  inferredSaving.value = true
  try {
    const updated = await salaryHistoryStore.upsertByPayPeriod({
      id: row.id,
      payPeriod: row.payPeriod,
      preTaxMonthly: row.preTaxMonthly,
      ssPersonalAmount: row.ssPersonalAmount,
      hfPersonalAmount: row.hfPersonalAmount,
      otherDeductionAmount: row.otherDeductionAmount,
      specialDeductionMonthly: row.specialDeductionMonthly,
      personalIncomeTax: row.personalIncomeTax,
      postTaxMonthly: row.postTaxMonthly,
      inferredPreTax: amount,
      reportBias,
      useInferredForCumulative: true,
      persistInferred: true,
    })
    showInferredConfirm.value = false
    inferredInputFocus.value = false
    // 以详情接口为准重拉 item + relatedVerifyList，避免仅信 upsert 回包漏字段
    historyId.value = updated.id
    await fetchDetail({ silent: true })
    uni.showToast({ title: '已按报税收入', icon: 'success' })
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : '保存失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
  finally {
    inferredSaving.value = false
  }
}

/** 改回按工资条应发累计；保留反推值便于再次确认 */
async function revertUseInferred() {
  const row = record.value
  if (!row || inferredSaving.value)
    return
  inferredSaving.value = true
  try {
    await salaryHistoryStore.upsertByPayPeriod({
      id: row.id,
      payPeriod: row.payPeriod,
      preTaxMonthly: row.preTaxMonthly,
      ssPersonalAmount: row.ssPersonalAmount,
      hfPersonalAmount: row.hfPersonalAmount,
      otherDeductionAmount: row.otherDeductionAmount,
      specialDeductionMonthly: row.specialDeductionMonthly,
      personalIncomeTax: row.personalIncomeTax,
      postTaxMonthly: row.postTaxMonthly,
      inferredPreTax: row.inferredPreTax,
      reportBias: row.reportBias,
      useInferredForCumulative: false,
      persistInferred: true,
    })
    await fetchDetail({ silent: true })
    uni.showToast({ title: '已改回工资条口径', icon: 'none' })
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : '保存失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
  finally {
    inferredSaving.value = false
  }
}

/** 顶部卡：一致 / 存在差异（优先展示实发差异，否则个税差异） */
const summaryMatch = computed(() => verify.value?.overallMatch ?? false)

const summaryDiffAmount = computed(() => {
  const v = verify.value
  if (!v || v.overallMatch)
    return 0
  // 实发列是顶部卡主对照；实发一致时才回退到个税差额
  if (!v.postTaxMatch)
    return Math.abs(v.postTaxDiff)
  return Math.abs(v.taxDiff)
})

const summaryTitle = computed(() => {
  if (!verify.value)
    return ''
  if (summaryMatch.value)
    return '核对一致'
  return `存在差异 ¥${fmt(summaryDiffAmount.value)}`
})

/**
 * 所属月标签（始终展示，避免多月核对时丢上下文）
 */
const summaryPeriodLabel = computed(() => {
  if (!record.value)
    return ''
  const { year, month } = parsePayPeriod(record.value.payPeriod)
  return `${year} 年 ${month} 月`
})

/**
 * 结论卡原因副文：差异态用人话主因；一致态不再重复「都对得上」
 */
const summaryCause = computed(() => {
  if (summaryMatch.value)
    return ''
  return verifyCause.value?.summary ?? ''
})

/** 差异态：打开核对页回填并锁定所属月（保存后 navigateBack 回本详情） */
function goReVerify() {
  const row = record.value
  if (!row?.payPeriod) {
    uni.showToast({ title: '缺少所属月', icon: 'none' })
    return
  }
  uni.navigateTo({
    url: `/pages/salary/verify?${buildVerifyReentryQuery(row)}`,
  })
}

/** 计算过程与原始明细默认折叠，不自动撑开 */
const showTaxCalc = ref(false)
const showRawFields = ref(false)

interface AmountRow {
  label: string
  value: string
}

const activeDeductionItems = computed((): AmountRow[] => {
  const b = breakdown.value
  if (!b)
    return []
  const items: AmountRow[] = []
  if (b.cumulativeStandardDeduction > 0)
    items.push({ label: '减除费用', value: fmt(b.cumulativeStandardDeduction) })
  if (b.cumulativeSpecialDeduction > 0)
    items.push({ label: '五险一金', value: fmt(b.cumulativeSpecialDeduction) })
  if (b.cumulativeSpecialAdditionalDeduction > 0)
    items.push({ label: '专项附加扣除', value: fmt(b.cumulativeSpecialAdditionalDeduction) })
  if (b.cumulativeTaxExemptIncome > 0)
    items.push({ label: '免税收入', value: fmt(b.cumulativeTaxExemptIncome) })
  if (b.cumulativeOtherDeduction > 0)
    items.push({ label: '其他扣除', value: fmt(b.cumulativeOtherDeduction) })
  if (b.cumulativePersonalPension > 0)
    items.push({ label: '个人养老金', value: fmt(b.cumulativePersonalPension) })
  if (b.cumulativeDonationDeduction > 0)
    items.push({ label: '准予扣除捐赠', value: fmt(b.cumulativeDonationDeduction) })
  return items
})

const totalDeductions = computed(() => {
  const b = breakdown.value
  if (!b)
    return 0
  return b.cumulativeIncome - b.cumulativeTaxableIncome
})

/**
 * 累计应纳税额拆解子项：应纳税所得额 × 预扣率 − 速算扣除数
 * @note 与税法「累计应预扣预缴税额」公式一致，便于对照父级合计
 */
const taxPayableCalcItems = computed((): AmountRow[] => {
  const b = breakdown.value
  if (!b)
    return []
  const rateAmount = Math.round(b.cumulativeTaxableIncome * b.taxRate * 100) / 100
  return [
    { label: `应纳税所得额×${fmtRate(b.taxRate)}`, value: fmt(rateAmount) },
    { label: '速算扣除数', value: `-${fmt(b.quickDeduction)}` },
  ]
})

function fmt(n: number) {
  return formatSalaryAmount(n)
}

function fmtRate(rate: number) {
  if (rate <= 0)
    return '0%'
  const pct = Math.round(rate * 10000) / 100
  return Number.isInteger(pct) ? `${pct}%` : `${pct}%`
}

function fmtDiff(diff: number) {
  const sign = diff > 0 ? '+' : ''
  return `${sign}${fmt(diff)}`
}
</script>

<template>
  <view class="page-shell pb-safe">
    <view v-if="record && verify && breakdown" class="p-24rpx">
      <!-- 顶部结论卡：结论一行 + 原因全文宽；操作轨再下沉，避免头区挤成一团 -->
      <view class="summary-card card-rounded p-32rpx">
        <view class="summary-card__head">
          <view class="summary-card__icon" :class="summaryMatch ? 'is-ok' : 'is-warn'">
            <view class="h-36rpx w-36rpx" :class="summaryMatch ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-filled'" />
          </view>
          <view class="summary-card__titles">
            <text class="summary-card__title" :class="summaryMatch ? 'is-ok' : 'is-warn'">
              {{ summaryTitle }}
            </text>
            <text class="summary-card__period">
              {{ summaryPeriodLabel }}
            </text>
          </view>
        </view>

        <text v-if="summaryCause" class="summary-card__sub">
          {{ summaryCause }}
        </text>

        <view v-if="calcModeHint" class="summary-card__hint mt-20rpx">
          <text class="summary-card__hint-text">
            {{ calcModeHint }}
          </text>
        </view>

        <!--
          操作轨：主路径用选择行；次链降为文字链，减轻结论卡厚度
        -->
        <view v-if="showActionRail" class="action-rail">
          <view v-if="canRevertInferred" class="action-rail__status">
            <view class="action-rail__status-main">
              <view class="action-rail__status-copy">
                <text class="action-rail__status-title">
                  已按报税收入
                </text>
                <text v-if="record.inferredPreTax != null" class="action-rail__status-sub">
                  ¥{{ fmt(record.inferredPreTax) }}
                </text>
              </view>
            </view>
            <view
              class="action-rail__status-revert pressable"
              hover-class="pressable-fade--pressed"
              :hover-stay-time="60"
              :class="{ 'is-disabled': inferredSaving }"
              @click="revertUseInferred"
            >
              改回
            </view>
          </view>

          <view
            v-if="showConfirmInferredPrimary"
            class="action-choice action-choice--primary pressable"
            hover-class="pressable--pressed"
            :hover-stay-time="70"
            :class="{ 'is-disabled': inferredSaving }"
            @click="openInferredConfirm"
          >
            <view class="action-choice__body">
              <text class="action-choice__title">
                按报税收入继续
              </text>
              <text class="action-choice__sub">
                {{ confirmActionSub }}
              </text>
            </view>
            <view class="action-choice__chevron i-carbon-chevron-right" />
          </view>

          <view
            v-if="showReverifyPrimary"
            class="action-choice action-choice--solo pressable"
            hover-class="pressable--pressed"
            :hover-stay-time="70"
            @click="goReVerify"
          >
            <view class="action-choice__body">
              <text class="action-choice__title">
                修改工资条
              </text>
              <text class="action-choice__sub">
                {{ reverifyActionSub }}
              </text>
            </view>
            <view class="action-choice__chevron i-carbon-chevron-right" />
          </view>

          <view
            v-else-if="showReverifySecondary"
            class="action-rail__link pressable"
            hover-class="pressable-fade--pressed"
            :hover-stay-time="60"
            @click="goReVerify"
          >
            <text class="action-rail__link-text">
              修改工资条
            </text>
            <view class="action-rail__link-chevron i-carbon-chevron-right" />
          </view>
        </view>
      </view>

      <!-- 对比表：原因已在结论卡 -->
      <view class="mt-24rpx card-rounded px-32rpx pb-8rpx">
        <view class="flex items-center gap-16rpx py-24rpx">
          <text class="text-30rpx text-#333 font-600">
            对比表
          </text>
          <text class="min-w-0 flex-1 text-24rpx text-#999">
            系统 vs 工资条
          </text>
        </view>

        <view class="compare-list mb-16rpx">
          <view class="compare-list__head">
            <text class="compare-list__cell compare-list__cell--item">
              核对项
            </text>
            <text class="compare-list__cell">
              系统
            </text>
            <text class="compare-list__cell">
              工资条
            </text>
            <text class="compare-list__cell">
              差异
            </text>
          </view>
          <view class="compare-list__row">
            <text class="compare-list__cell compare-list__cell--item">
              个税
            </text>
            <text class="compare-list__cell tabular-nums">
              {{ fmt(verify.expectedTax) }}
            </text>
            <text class="compare-list__cell tabular-nums">
              {{ fmt(record.personalIncomeTax) }}
            </text>
            <text class="compare-list__cell compare-list__cell--diff tabular-nums" :class="verify.taxMatch ? 'is-ok' : 'is-warn'">
              {{ verify.taxMatch ? '一致' : fmtDiff(verify.taxDiff) }}
            </text>
          </view>
          <view class="compare-list__row">
            <text class="compare-list__cell compare-list__cell--item">
              税后月薪
            </text>
            <text class="compare-list__cell tabular-nums">
              {{ fmt(verify.expectedPostTax) }}
            </text>
            <text class="compare-list__cell tabular-nums">
              {{ fmt(record.postTaxMonthly) }}
            </text>
            <text class="compare-list__cell compare-list__cell--diff tabular-nums" :class="verify.postTaxMatch ? 'is-ok' : 'is-warn'">
              {{ verify.postTaxMatch ? '一致' : fmtDiff(verify.postTaxDiff) }}
            </text>
          </view>
        </view>
      </view>

      <!-- 计算过程默认折叠，不自动撑开 -->
      <view class="mt-24rpx card-rounded px-32rpx">
        <view
          class="pressable flex items-center gap-16rpx py-24rpx"
          hover-class="pressable-soft--pressed"
          :hover-stay-time="60"
          @click="showTaxCalc = !showTaxCalc"
        >
          <view class="h-28rpx w-6rpx shrink-0 rounded-4rpx bg-primary" />
          <text class="text-30rpx text-#333 font-600">
            怎么算的
          </text>
          <text class="min-w-0 flex-1 text-24rpx text-#999">
            本期个税计算过程
          </text>
          <wd-icon :name="showTaxCalc ? 'up' : 'down'" size="28rpx" color="#c0c4cc" />
        </view>

        <view v-if="showTaxCalc" class="mb-24rpx">
          <view class="calc-step">
            <text class="calc-step__no"> ① </text>
            <view class="calc-step__body">
              <view class="calc-step__row">
                <text class="calc-step__label"> 累计收入 </text>
                <text class="calc-step__val tabular-nums">
                  {{ fmt(breakdown.cumulativeIncome) }}
                </text>
              </view>
            </view>
          </view>

          <view class="calc-step">
            <text class="calc-step__no"> ② </text>
            <view class="calc-step__body">
              <view class="calc-step__row">
                <text class="calc-step__label"> 减去各项扣除 </text>
                <text class="calc-step__val calc-step__val--minus tabular-nums"> -{{ fmt(totalDeductions) }} </text>
              </view>
              <view v-for="item in activeDeductionItems" :key="item.label" class="calc-step__sub">
                <text class="calc-step__sub-label"> · {{ item.label }} </text>
                <text class="calc-step__sub-val tabular-nums">
                  {{ item.value }}
                </text>
              </view>
            </view>
          </view>

          <view class="calc-step">
            <text class="calc-step__no"> ③ </text>
            <view class="calc-step__body">
              <view class="calc-step__row">
                <text class="calc-step__label"> 累计应纳税所得额 </text>
                <text class="calc-step__val tabular-nums">
                  {{ fmt(breakdown.cumulativeTaxableIncome) }}
                </text>
              </view>
            </view>
          </view>

          <view class="calc-step">
            <text class="calc-step__no"> ④ </text>
            <view class="calc-step__body">
              <view class="calc-step__row">
                <text class="calc-step__label"> 累计应纳税额 </text>
                <text class="calc-step__val tabular-nums">
                  {{ fmt(breakdown.cumulativeTaxPayable) }}
                </text>
              </view>
              <view v-for="item in taxPayableCalcItems" :key="item.label" class="calc-step__sub">
                <text class="calc-step__sub-label"> · {{ item.label }} </text>
                <text class="calc-step__sub-val tabular-nums">
                  {{ item.value }}
                </text>
              </view>
            </view>
          </view>

          <view class="calc-step">
            <text class="calc-step__no"> ⑤ </text>
            <view class="calc-step__body">
              <view class="calc-step__row">
                <text class="calc-step__label"> 减去已缴税额 </text>
                <text class="calc-step__val calc-step__val--minus tabular-nums"> -{{ fmt(breakdown.cumulativeTaxPaid) }} </text>
              </view>
            </view>
          </view>

          <view class="calc-step">
            <text class="calc-step__no"> ⑥ </text>
            <view class="calc-step__body">
              <view class="calc-step__row">
                <text class="calc-step__label"> 本期应扣个税 </text>
                <text class="calc-step__val font-600 tabular-nums">
                  {{ fmt(breakdown.currentPeriodTax) }}
                </text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 工资条原始数据（默认折叠） -->
      <view class="mt-24rpx card-rounded px-32rpx">
        <view
          class="pressable flex items-center gap-16rpx py-24rpx"
          hover-class="pressable-soft--pressed"
          :hover-stay-time="60"
          @click="showRawFields = !showRawFields"
        >
          <view class="h-28rpx w-6rpx shrink-0 rounded-4rpx bg-primary" />
          <text class="text-30rpx text-#333 font-600">
            工资条数据
          </text>
          <text class="min-w-0 flex-1 text-24rpx text-#999">
            录入的原始金额
          </text>
          <wd-icon :name="showRawFields ? 'up' : 'down'" size="28rpx" color="#c0c4cc" />
        </view>

        <view v-if="showRawFields" class="mb-24rpx">
          <view v-for="key in fieldKeys" :key="key" class="detail-row">
            <text class="detail-label">
              {{ PAYSLIP_FIELD_LABELS[key] }}
            </text>
            <text class="detail-val tabular-nums">
              {{ fmt(record[key]) }}
            </text>
          </view>
        </view>
      </view>

      <!-- #ifdef MP-WEIXIN -->
      <wd-button variant="text" block size="mini" custom-class="mt-16rpx !text-22rpx !text-#999" open-type="share">
        如果觉得这个工具不错，分享给好友吧
      </wd-button>
      <!-- #endif -->
    </view>

    <view v-else-if="loading" class="detail-state">
      <text class="detail-state__text">
        加载中…
      </text>
    </view>

    <view v-else-if="loadFailed" class="detail-state">
      <wd-empty tip="记录不存在或加载失败" />
      <wd-button type="primary" block :round="true" custom-class="mt-32rpx" @click="retryLoad">
        重试
      </wd-button>
    </view>

    <!--
      按报税收入继续：二次确认
      职责：对照工资条 / 报税收入，主路径明确提交；弹层里再点明可对照个人所得税 App
    -->
    <wd-popup
      v-model="showInferredConfirm"
      custom-class="rounded-28rpx"
      :close-on-click-modal="!inferredSaving"
      :z-index="popupZIndex"
      root-portal
      lock-scroll
    >
      <view class="inferred-alert" :class="{ 'is-saving': inferredSaving }">
        <text class="inferred-alert__title">
          确认报税收入
        </text>
        <text class="inferred-alert__message">
          对照个税 App 里的收入改准；后面按这个数来算
        </text>

        <view class="inferred-alert__card">
          <view class="inferred-alert__row">
            <text class="inferred-alert__row-label">
              工资条
            </text>
            <text class="inferred-alert__row-value">
              ¥{{ inferredConfirmSlipText }}
            </text>
          </view>

          <!-- 独立白底输入槽：与只读行对比，明确可改 -->
          <view class="inferred-alert__field" :class="{ 'is-disabled': inferredSaving }">
            <view class="inferred-alert__field-head">
              <text class="inferred-alert__field-label">
                报税收入
              </text>
              <view class="inferred-alert__field-hint">
                <view class="inferred-alert__field-hint-icon i-carbon-edit" />
              </view>
            </view>
            <view class="inferred-alert__field-body">
              <text class="inferred-alert__currency">
                ¥
              </text>
              <input
                class="inferred-alert__input"
                type="digit"
                :value="inferredEditText"
                :disabled="inferredSaving"
                :focus="inferredInputFocus"
                :adjust-position="true"
                :cursor-spacing="24"
                placeholder="输入报税收入"
                placeholder-style="color:#c5c9ce;font-size:32rpx;font-weight:500;"
                @input="onInferredEditInput"
                @blur="inferredInputFocus = false"
              >
            </view>
          </view>
        </view>

        <view class="inferred-alert__actions">
          <wd-button
            type="info"
            variant="plain"
            block
            :disabled="inferredSaving"
            @click="closeInferredConfirm"
          >
            取消
          </wd-button>
          <wd-button
            type="primary"
            block
            :loading="inferredSaving"
            :disabled="inferredSaving"
            @click="submitConfirmedInferred"
          >
            确认
          </wd-button>
        </view>
      </view>
    </wd-popup>
  </view>
</template>

<style scoped lang="scss">
.detail-state {
  padding: 80rpx 48rpx 48rpx;
}

.detail-state__text {
  display: block;
  text-align: center;
  font-size: 28rpx;
  color: #8a9199;
}

.summary-card {
  display: flex;
  flex-direction: column;
}

.summary-card__head {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.summary-card__icon {
  flex-shrink: 0;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.summary-card__icon.is-ok {
  color: var(--wot-success-main);
  background: var(--wot-success-surface);
}

.summary-card__icon.is-warn {
  color: var(--wot-warning-main);
  background: var(--wot-warning-surface);
}

.summary-card__titles {
  flex: 1;
  min-width: 0;
}

.summary-card__title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  line-height: 1.3;
}

.summary-card__title.is-ok {
  color: var(--wot-success-main);
}

.summary-card__title.is-warn {
  color: var(--wot-warning-main);
}

.summary-card__period {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #8a9199;
  line-height: 1.3;
}

/* 原因全文宽，不跟图标并排挤换行 */
.summary-card__sub {
  display: block;
  margin-top: 20rpx;
  font-size: 26rpx;
  color: #5c6670;
  line-height: 1.5;
}

.summary-card__hint {
  padding: 12rpx 16rpx;
  border-radius: 12rpx;
  background: #f5f6f8;
}

.summary-card__hint-text {
  display: block;
  font-size: 22rpx;
  color: #8a9199;
  line-height: 1.45;
}

/* 结论卡操作轨：主路径一块，次链文字降权 */
.action-rail {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-top: 28rpx;
}

/*
 * 状态条与主选择行共用行高/内边距
 */
.action-rail__status,
.action-choice {
  box-sizing: border-box;
  min-height: 104rpx;
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
}

.action-rail__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  background: var(--wot-success-surface);
  border: 1rpx solid var(--wot-success-particular);
}

.action-rail__status-main {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-width: 0;
  flex: 1;
}

.action-rail__status-copy {
  min-width: 0;
}

.action-rail__status-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--wot-success-main);
  letter-spacing: -0.015em;
  line-height: 1.3;
}

.action-rail__status-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #5c6670;
  line-height: 1.4;
}

.action-rail__status-revert {
  flex-shrink: 0;
  padding: 8rpx 4rpx 8rpx 12rpx;
  font-size: 24rpx;
  font-weight: 500;
  color: var(--wot-primary-6);
}

.action-choice {
  display: flex;
  align-items: center;
  gap: 12rpx;
  background: #f5f6f8;
  border: 1rpx solid transparent;
}

.action-choice--primary {
  background: var(--wot-primary-1);
  border-color: var(--wot-primary-2);
}

.action-choice--secondary {
  background: #f5f6f8;
}

.action-choice--solo {
  background: var(--wot-primary-1);
  border-color: var(--wot-primary-2);
}

.action-choice__body {
  flex: 1;
  min-width: 0;
}

.action-choice__title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1a1a1a;
  letter-spacing: -0.015em;
  line-height: 1.3;
}

.action-choice--primary .action-choice__title,
.action-choice--solo .action-choice__title {
  color: var(--wot-primary-6);
}

.action-choice__sub {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #8a9199;
  line-height: 1.4;
}

.action-choice__chevron {
  flex-shrink: 0;
  width: 28rpx;
  height: 28rpx;
  color: #c0c4cc;
}

.action-choice--primary .action-choice__chevron,
.action-choice--solo .action-choice__chevron {
  color: var(--wot-primary-6);
  opacity: 0.55;
}

.action-choice.is-disabled,
.action-rail__status-revert.is-disabled {
  opacity: 0.55;
  pointer-events: none;
}

/* 次链：单行文字，不与主 CTA 抢块级厚度 */
.action-rail__link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  padding: 16rpx 8rpx 4rpx;
}

.action-rail__link-text {
  font-size: 24rpx;
  font-weight: 500;
  color: #8a9199;
  line-height: 1.3;
}

.action-rail__link-chevron {
  width: 24rpx;
  height: 24rpx;
  color: #c0c4cc;
}

/*
 * 二次确认：iOS alert 结构 + 可编辑金额卡
 * 主按钮实心底、取消纯文字；按压缩放走全局 pressable，按下即时反馈
 */
.inferred-alert {
  width: 660rpx;
  padding: 36rpx;
  border-radius: 28rpx;
  background: #fff;
  box-sizing: border-box;
  box-shadow:
    0 8rpx 40rpx rgba(15, 23, 42, 0.12),
    0 1rpx 0 rgba(255, 255, 255, 0.6) inset;
}

.inferred-alert__title {
  display: block;
  text-align: center;
  font-size: 34rpx;
  font-weight: 600;
  color: #111;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.inferred-alert__message {
  display: block;
  margin-top: 12rpx;
  text-align: center;
  font-size: 24rpx;
  color: #8a9199;
  line-height: 1.45;
  letter-spacing: 0.01em;
}

.inferred-alert__card {
  margin-top: 28rpx;
  padding: 8rpx 16rpx 16rpx;
  border-radius: 20rpx;
  background: #f5f6f8;
}

.inferred-alert__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  min-height: 72rpx;
  padding: 0 12rpx;
}

.inferred-alert__row-label {
  font-size: 24rpx;
  color: #8a9199;
  line-height: 1.3;
}

.inferred-alert__row-value {
  font-size: 26rpx;
  font-weight: 500;
  color: #333;
  letter-spacing: -0.01em;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}

/* 白底描边输入槽：与上方只读行形成「可点可改」对比 */
.inferred-alert__field {
  margin-top: 8rpx;
  padding: 18rpx 20rpx 16rpx;
  border-radius: 16rpx;
  background: #fff;
  border: 2rpx solid var(--wot-primary-4);
  box-shadow: 0 0 0 6rpx var(--wot-primary-1);
}

.inferred-alert__field.is-disabled {
  opacity: 0.55;
  border-color: #d8dce2;
  box-shadow: none;
}

.inferred-alert__field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.inferred-alert__field-label {
  font-size: 22rpx;
  font-weight: 500;
  color: var(--wot-primary-7);
  letter-spacing: 0.01em;
  line-height: 1.3;
}

.inferred-alert__field-hint {
  display: flex;
  align-items: center;
  gap: 6rpx;
}

.inferred-alert__field-hint-icon {
  width: 24rpx;
  height: 24rpx;
  color: var(--wot-primary-6);
}

.inferred-alert__field-hint-text {
  font-size: 22rpx;
  color: var(--wot-primary-6);
  line-height: 1.3;
}

.inferred-alert__field-body {
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin-top: 10rpx;
  min-height: 72rpx;
  padding-bottom: 4rpx;
  border-bottom: 2rpx solid rgba(22, 136, 255, 0.28);
}

.inferred-alert__currency {
  flex-shrink: 0;
  font-size: 36rpx;
  font-weight: 600;
  color: #111;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.inferred-alert__input {
  flex: 1;
  min-width: 0;
  height: 72rpx;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 44rpx;
  font-weight: 600;
  color: #111;
  letter-spacing: -0.03em;
  line-height: 72rpx;
  font-variant-numeric: tabular-nums;
}

.inferred-alert__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32rpx;
  margin-top: 32rpx;
}

.inferred-alert.is-saving .inferred-alert__input {
  opacity: 0.55;
}

.compare-list__head,
.compare-list__row {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
}

.compare-list__row + .compare-list__row {
  border-top: 1rpx solid #f0f2f5;
}

.compare-list__cell {
  flex: 1;
  font-size: 24rpx;
  color: #333;
  text-align: right;
  line-height: 1.4;
}

.compare-list__cell--item {
  flex: 0 0 120rpx;
  color: #666;
  text-align: left;
}

.compare-list__head .compare-list__cell {
  font-size: 22rpx;
  color: #999;
}

.compare-list__cell--diff.is-ok {
  color: var(--wot-success-main);
}

.compare-list__cell--diff.is-warn {
  color: var(--wot-warning-main);
}

.calc-step {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 0;
}

.calc-step__no {
  flex-shrink: 0;
  width: 40rpx;
  font-size: 28rpx;
  color: #999;
  line-height: 1.6;
}

.calc-step__body {
  flex: 1;
  min-width: 0;
}

.calc-step__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.calc-step__label {
  font-size: 28rpx;
  color: #666;
}

.calc-step__val {
  font-size: 28rpx;
  color: #333;
  text-align: right;
}

.calc-step__val--minus {
  color: var(--wot-danger-main);
}

.calc-step__sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8rpx;
  padding-left: 8rpx;
}

.calc-step__sub-label {
  font-size: 24rpx;
  color: #999;
}

.calc-step__sub-val {
  font-size: 24rpx;
  color: #999;
}

.collapse-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 16rpx 0;
}

.detail-label {
  flex-shrink: 0;
  font-size: 26rpx;
  color: #333;
}

.detail-val {
  font-size: 26rpx;
  color: #333;
  text-align: right;
}
</style>

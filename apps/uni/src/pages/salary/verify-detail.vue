<script lang="ts" setup>
/**
 * 月薪核对历史详情：顶部结论卡 → 项目对比 → 计算过程 → 工资条原始数据。
 * 主流程：详情接口 → 页面本地 item + relatedVerifyList → 累计预扣重算（不写列表 store）
 * 拉新：微信转发落到核对页（带 from），标题仅结论不带金额
 */
import type { PayslipVerifyRecord } from '@/store/salaryHistory'
import type { PayslipFieldKey } from '@/utils/salarySlipFieldMap'
import { onLoad, onShareAppMessage, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { getSalaryHistoryDetail } from '@/api/salary-verify'
import { toHistoryRecord, toVerifyRecord } from '@/store/salaryHistory'
import { buildFromQuery, DEFAULT_SHARE_FROM } from '@/utils/channelFrom'
import { formatSalaryAmount } from '@/utils/formatSalaryAmount'
import { SHARE_POSTER_URL } from '@/utils/lionAssets'
import { buildPayPeriod, parsePayPeriod } from '@/utils/payPeriod'
import { computeVerifyBreakdown } from '@/utils/payslipVerify'
import { PAYSLIP_FIELD_LABELS } from '@/utils/salarySlipFieldMap'
import { buildVerifyReentryQuery } from '@/utils/verifyReentry'

defineOptions({ name: 'SalaryVerifyDetail' })

definePage({
  style: {
    navigationBarTitleText: '工资条识别核对·明细',
  },
})

const historyId = ref('')
const loadFailed = ref(false)
/** 当前核对记录（页面态） */
const record = ref<PayslipVerifyRecord | null>(null)
/** 同年核对列表，仅供本页累计预扣，不进 store.items */
const relatedVerifyList = ref<PayslipVerifyRecord[]>([])

const fieldKeys: PayslipFieldKey[] = [
  'preTaxMonthly',
  'ssPersonalAmount',
  'hfPersonalAmount',
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

onShow(async () => {
  if (!historyId.value)
    return
  loadFailed.value = false
  try {
    const detail = await getSalaryHistoryDetail(Number(historyId.value))
    const main = toVerifyRecord(toHistoryRecord(detail.item))
    if (!main) {
      loadFailed.value = true
      uni.showToast({ title: '记录类型不正确', icon: 'none' })
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
    uni.showToast({ title: '历史记录加载失败', icon: 'none' })
  }
})

const detail = computed(() => {
  if (!record.value)
    return null
  return computeVerifyBreakdown(record.value, relatedVerifyList.value)
})

const verify = computed(() => detail.value?.verify ?? null)
const breakdown = computed(() => detail.value?.breakdown ?? null)

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

const calcModeHint = computed(() => {
  const v = verify.value
  if (!v || v.calcMode !== 'ideal')
    return ''
  const missing = v.missingPriorMonths
  if (missing?.length) {
    const months = missing.map(m => `${m}月`).join('、')
    return `缺少 ${months} 核对记录，暂按本月工资推算前序月份，结果仅供参考；补全后更准确`
  }
  return '暂无完整历史，按本月工资估算累计个税，结果仅供参考'
})

/** 首个缺月 YYYY-MM；仅引导一个月，避免一次塞多月 */
const firstMissingPayPeriod = computed(() => {
  const missing = verify.value?.missingPriorMonths
  if (!missing?.length || !record.value)
    return ''
  const { year } = parsePayPeriod(record.value.payPeriod)
  if (!year)
    return ''
  return buildPayPeriod(year, missing[0])
})

const firstMissingMonthLabel = computed(() => {
  if (!firstMissingPayPeriod.value)
    return ''
  const { month } = parsePayPeriod(firstMissingPayPeriod.value)
  return `${month}月`
})

const verdictSummary = computed(() => {
  const v = verify.value
  if (!v)
    return ''
  if (v.overallMatch)
    return '个税和税后均与累计预扣法计算结果一致'
  if (v.taxMatch && !v.postTaxMatch) {
    const sign = v.postTaxDiff > 0 ? '多扣' : '少扣'
    return `税后可能${sign}${formatSalaryAmount(Math.abs(v.postTaxDiff))}，请检查工资条各扣款项`
  }
  if (!v.taxMatch && v.postTaxMatch) {
    const sign = v.taxDiff > 0 ? '多扣' : '少扣'
    return `个税可能${sign}${formatSalaryAmount(Math.abs(v.taxDiff))}，请检查个税申报数据`
  }
  return '个税与税后均存在差异，请检查个税申报数据与工资条'
})

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
 * 副标题「YYYY 年 M 月 工资条」
 */
const summarySubtitle = computed(() => {
  if (!record.value)
    return ''
  const { year, month } = parsePayPeriod(record.value.payPeriod)
  return `${year} 年 ${month} 月 工资条`
})

/** 差异态：跳转核对页并短字段带回全量数据，锁定所属月 */
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

/** 缺月补全：仅预填首个缺月，不带回当前月金额 */
function goFillMissingMonth() {
  if (!firstMissingPayPeriod.value)
    return
  uni.navigateTo({
    url: `/pages/salary/verify?payPeriod=${encodeURIComponent(firstMissingPayPeriod.value)}`,
  })
}

/** 结论页降噪：计算过程与原始明细默认折叠 */
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
      <view v-if="calcModeHint" class="compare-hint mb-24rpx">
        <text class="compare-hint__text">
          {{ calcModeHint }}
        </text>
        <view
          v-if="firstMissingPayPeriod"
          class="compare-hint__cta pressable mt-16rpx"
          hover-class="pressable--pressed"
          :hover-stay-time="70"
          @click="goFillMissingMonth"
        >
          去补 {{ firstMissingMonthLabel }} 核对
        </view>
      </view>

      <!-- 顶部结论卡：一致或差异状态 -->
      <view class="summary-card card-rounded p-32rpx">
        <view class="summary-card__head">
          <view class="summary-card__icon" :class="summaryMatch ? 'is-ok' : 'is-warn'">
            <view class="h-36rpx w-36rpx" :class="summaryMatch ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-filled'" />
          </view>
          <view class="summary-card__titles">
            <text class="summary-card__title" :class="summaryMatch ? 'is-ok' : 'is-warn'">
              {{ summaryTitle }}
            </text>
            <text class="summary-card__sub">
              {{ summarySubtitle }}
            </text>
          </view>
        </view>
        <view class="summary-card__actions">
          <wd-text v-if="!summaryMatch" type="primary" text="重新核对" @click="goReVerify" />
        </view>
      </view>

      <!-- 第一层：结论 + 列表对照 -->
      <view class="mt-24rpx card-rounded px-32rpx">
        <view class="flex items-center gap-16rpx py-24rpx">
          <view class="h-28rpx w-6rpx shrink-0 rounded-4rpx bg-primary" />
          <text class="text-30rpx text-#333 font-600"> 项目对比 </text>
          <text class="text-24rpx text-#999">系统vs工资条</text>
        </view>

        <view class="mb-16rpx text-26rpx">
          {{ verdictSummary }}
        </view>

        <view class="compare-table mb-24rpx">
          <view class="compare-table__head">
            <text class="compare-table__cell compare-table__cell--item"> 核对项 </text>
            <text class="compare-table__cell"> 系统计算 </text>
            <text class="compare-table__cell"> 工资条 </text>
            <text class="compare-table__cell"> 差异 </text>
          </view>
          <view class="compare-table__row">
            <text class="compare-table__cell compare-table__cell--item"> 个税 </text>
            <text class="compare-table__cell tabular-nums">
              {{ fmt(verify.expectedTax) }}
            </text>
            <text class="compare-table__cell tabular-nums">
              {{ fmt(record.personalIncomeTax) }}
            </text>
            <text class="compare-table__cell compare-table__cell--diff tabular-nums" :class="verify.taxMatch ? 'is-ok' : 'is-warn'">
              {{ verify.taxMatch ? "一致" : fmtDiff(verify.taxDiff) }}
            </text>
          </view>
          <view class="compare-table__row">
            <text class="compare-table__cell compare-table__cell--item"> 税后月薪 </text>
            <text class="compare-table__cell tabular-nums">
              {{ fmt(verify.expectedPostTax) }}
            </text>
            <text class="compare-table__cell tabular-nums">
              {{ fmt(record.postTaxMonthly) }}
            </text>
            <text class="compare-table__cell compare-table__cell--diff tabular-nums" :class="verify.postTaxMatch ? 'is-ok' : 'is-warn'">
              {{ verify.postTaxMatch ? "一致" : fmtDiff(verify.postTaxDiff) }}
            </text>
          </view>
        </view>
      </view>

      <!-- 第二层：计算过程（默认折叠，优先结论与对比） -->
      <view class="mt-24rpx card-rounded px-32rpx">
        <view
          class="pressable flex items-center gap-16rpx py-24rpx"
          hover-class="pressable-soft--pressed"
          :hover-stay-time="60"
          @click="showTaxCalc = !showTaxCalc"
        >
          <view class="h-28rpx w-6rpx shrink-0 rounded-4rpx bg-primary" />
          <text class="text-30rpx text-#333 font-600"> 个税计算 </text>
          <text class="min-w-0 flex-1 text-24rpx text-#999">本期个税怎么算出来的</text>
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
          <text class="text-30rpx text-#333 font-600"> 工资条明细 </text>
          <text class="min-w-0 flex-1 text-24rpx text-#999">原始数据</text>
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

    <view v-else-if="loadFailed" class="px-32rpx pt-80rpx">
      <wd-empty tip="记录不存在或加载失败" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.summary-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.summary-card__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12rpx;
  flex-shrink: 0;
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
  color: var(--wot-danger-main);
  background: var(--wot-danger-surface, #ffecec);
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
  color: var(--wot-danger-main);
}

.summary-card__sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #333;
  line-height: 1.4;
}

.compare-table {
  border: 2rpx solid #f0f0f0;
  border-radius: 12rpx;
  overflow: hidden;
}

.compare-table__head,
.compare-table__row {
  display: flex;
  align-items: center;
}

.compare-table__head {
  background: #f7f8fa;
}

.compare-table__row + .compare-table__row {
  border-top: 2rpx solid #f0f0f0;
}

.compare-table__cell {
  flex: 1;
  padding: 20rpx 12rpx;
  font-size: 24rpx;
  color: #333;
  text-align: right;
  line-height: 1.4;
}

.compare-table__cell--item {
  flex: 0 0 140rpx;
  color: #666;
  text-align: left;
  padding-left: 20rpx;
}

.compare-table__head .compare-table__cell {
  font-size: 22rpx;
  color: #999;
}

.compare-table__cell--diff.is-ok {
  color: var(--wot-success-main);
}

.compare-table__cell--diff.is-warn {
  color: var(--wot-warning-main);
}

.compare-hint {
  padding: 16rpx 20rpx;
  border-radius: 12rpx;
  background: var(--wot-warning-surface);
  font-size: 24rpx;
  color: var(--wot-warning-main);
  line-height: 1.5;
  animation: tip-enter 200ms var(--ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)) both;
}

.compare-hint__text {
  display: block;
}

.compare-hint__cta {
  display: inline-flex;
  align-items: center;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--wot-primary-6);
  padding: 4rpx 0;
}

@keyframes tip-enter {
  from {
    opacity: 0;
    transform: translateY(8rpx) scale(0.97);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .compare-hint {
    animation: none;
  }
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

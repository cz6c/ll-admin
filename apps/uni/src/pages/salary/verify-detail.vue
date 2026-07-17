<script lang="ts" setup>
/**
 * 月薪核对历史详情：结论对比 → 计算过程 → 可展开完整明细。
 * 数据来自历史列表本地重算，不拉详情接口。
 */
import type { PayslipFieldKey } from '@/utils/salarySlipFieldMap'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useSalaryVerifyHistoryStore } from '@/store/salaryVerifyHistory'
import { formatPayPeriodLabel } from '@/utils/payPeriod'
import {
  computeVerifyBreakdown,
  taxDiffHint,
} from '@/utils/payslipVerify'
import { PAYSLIP_FIELD_LABELS } from '@/utils/salarySlipFieldMap'

defineOptions({ name: 'SalaryVerifyDetail' })

definePage({
  style: {
    navigationBarTitleText: '核对详情',
  },
})

const verifyHistoryStore = useSalaryVerifyHistoryStore()
const { items: verifyList } = storeToRefs(verifyHistoryStore)

const historyId = ref('')
const loadFailed = ref(false)
const showFullBreakdown = ref(false)
const showPayslipRaw = ref(false)

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
})

onShow(async () => {
  if (!historyId.value)
    return
  if (verifyHistoryStore.findById(historyId.value))
    return
  try {
    await verifyHistoryStore.fetchHistory()
  }
  catch {
    loadFailed.value = true
    uni.showToast({ title: '历史记录加载失败', icon: 'none' })
  }
  if (!verifyHistoryStore.findById(historyId.value)) {
    loadFailed.value = true
    uni.showToast({ title: '记录不存在', icon: 'none' })
  }
})

const record = computed(() => {
  if (!historyId.value)
    return null
  return verifyHistoryStore.findById(historyId.value) ?? null
})

const detail = computed(() => {
  if (!record.value)
    return null
  return computeVerifyBreakdown(record.value, verifyList.value)
})

const verify = computed(() => detail.value?.verify ?? null)
const breakdown = computed(() => detail.value?.breakdown ?? null)

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

const verdictSummary = computed(() => {
  const v = verify.value
  if (!v)
    return ''
  if (v.overallMatch)
    return '个税和税后均与累计预扣法计算结果一致'
  if (v.taxMatch && !v.postTaxMatch)
    return '税后计算存在差异，请检查工资条各扣款项是否正确'
  if (!v.taxMatch && v.postTaxMatch)
    return '个税计算存在差异，请检查税前是否和申报的一致'
  return '个税与税后均存在差异，请逐项核对工资条'
})

interface AmountRow { label: string, value: string }

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

const incomeRows = computed((): AmountRow[] => {
  const b = breakdown.value
  if (!b)
    return []
  return [
    { label: '累计收入', value: fmt(b.cumulativeIncome) },
    { label: '累计免税收入', value: fmt(b.cumulativeTaxExemptIncome) },
    { label: '累计减除费用', value: fmt(b.cumulativeStandardDeduction) },
    { label: '累计专项扣除', value: fmt(b.cumulativeSpecialDeduction) },
    { label: '累计专项附加扣除', value: fmt(b.cumulativeSpecialAdditionalDeduction) },
    { label: '累计其他扣除', value: fmt(b.cumulativeOtherDeduction) },
    { label: '累计个人养老金', value: fmt(b.cumulativePersonalPension) },
    { label: '累计准予扣除的捐赠额', value: fmt(b.cumulativeDonationDeduction) },
    { label: '累计应纳税所得额', value: fmt(b.cumulativeTaxableIncome) },
  ]
})

const taxRows = computed((): AmountRow[] => {
  const b = breakdown.value
  if (!b)
    return []
  return [
    { label: '累计应纳税所得额', value: fmt(b.cumulativeTaxableIncome) },
    { label: '税率/预扣率', value: fmtRate(b.taxRate) },
    { label: '速算扣除数', value: fmt(b.quickDeduction) },
    { label: '累计应纳税额', value: fmt(b.cumulativeTaxPayable) },
    { label: '累计已缴税额', value: fmt(b.cumulativeTaxPaid) },
    { label: '累计减免税额', value: fmt(b.cumulativeTaxReduction) },
    { label: '本期申报税额', value: fmt(b.currentPeriodTax) },
  ]
})

function fmt(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2)
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
  <view class="page-shell pb-32rpx">
    <template v-if="record && verify && breakdown">
      <view class="bg-white p-32rpx">
        <view class="flex items-center justify-between gap-16rpx">
          <text class="text-32rpx text-#333 font-medium">
            {{ formatPayPeriodLabel(record.payPeriod) }}
          </text>
          <wd-tag
            :type="verify.overallMatch ? 'success' : 'warning'"
            variant="light"
            size="medium"
            custom-class="ml-auto shrink-0"
          >
            {{ verify.overallMatch ? '核对无误' : '发现差异' }}
          </wd-tag>
        </view>

        <view v-if="calcModeHint" class="compare-hint mt-24rpx">
          {{ calcModeHint }}
        </view>
      </view>

      <!-- 第一层：结论 + 列表对照 -->
      <view class="mt-16rpx bg-white p-32rpx">
        <view class="mb-16rpx flex items-center gap-16rpx">
          <view class="h-28rpx w-6rpx shrink-0 rounded-4rpx bg-primary" />
          <text class="text-30rpx text-#333 font-600">
            核对结果
          </text>
        </view>

        <text class="mb-16rpx block text-26rpx text-#666 leading-relaxed">
          {{ verdictSummary }}
        </text>

        <view class="compare-table">
          <view class="compare-table__head">
            <text class="compare-table__cell compare-table__cell--item">
              核对项
            </text>
            <text class="compare-table__cell">
              系统计算
            </text>
            <text class="compare-table__cell">
              工资条
            </text>
            <text class="compare-table__cell">
              差异
            </text>
          </view>
          <view class="compare-table__row">
            <text class="compare-table__cell compare-table__cell--item">
              个税
            </text>
            <text class="compare-table__cell tabular-nums">
              {{ fmt(verify.expectedTax) }}
            </text>
            <text class="compare-table__cell tabular-nums">
              {{ fmt(record.personalIncomeTax) }}
            </text>
            <text
              class="compare-table__cell compare-table__cell--diff tabular-nums"
              :class="verify.taxMatch ? 'is-ok' : 'is-warn'"
            >
              {{ fmtDiff(verify.taxDiff) }}
            </text>
          </view>
          <view class="compare-table__row">
            <text class="compare-table__cell compare-table__cell--item">
              税后月薪
            </text>
            <text class="compare-table__cell tabular-nums">
              {{ fmt(verify.expectedPostTax) }}
            </text>
            <text class="compare-table__cell tabular-nums">
              {{ fmt(record.postTaxMonthly) }}
            </text>
            <text
              class="compare-table__cell compare-table__cell--diff tabular-nums"
              :class="verify.postTaxMatch ? 'is-ok' : 'is-warn'"
            >
              {{ fmtDiff(verify.postTaxDiff) }}
            </text>
          </view>
        </view>

        <view v-if="taxDiffHint(verify.taxDiff)" class="compare-hint mt-24rpx">
          {{ taxDiffHint(verify.taxDiff) }}
        </view>
      </view>

      <!-- 第二层：计算过程 -->
      <view class="mt-16rpx bg-white p-32rpx">
        <view class="mb-16rpx flex items-center gap-16rpx">
          <view class="h-28rpx w-6rpx shrink-0 rounded-4rpx bg-primary" />
          <text class="text-30rpx text-#333 font-600">
            本期个税怎么算出来的
          </text>
        </view>

        <view class="calc-step">
          <text class="calc-step__no">
            ①
          </text>
          <view class="calc-step__body">
            <view class="calc-step__row">
              <text class="calc-step__label">
                累计收入
              </text>
              <text class="calc-step__val tabular-nums">
                {{ fmt(breakdown.cumulativeIncome) }}
              </text>
            </view>
          </view>
        </view>

        <view class="calc-step">
          <text class="calc-step__no">
            ②
          </text>
          <view class="calc-step__body">
            <view class="calc-step__row">
              <text class="calc-step__label">
                减去各项扣除
              </text>
              <text class="calc-step__val calc-step__val--minus tabular-nums">
                -{{ fmt(totalDeductions) }}
              </text>
            </view>
            <view
              v-for="item in activeDeductionItems"
              :key="item.label"
              class="calc-step__sub"
            >
              <text class="calc-step__sub-label">
                · {{ item.label }}
              </text>
              <text class="calc-step__sub-val tabular-nums">
                {{ item.value }}
              </text>
            </view>
          </view>
        </view>

        <view class="calc-step">
          <text class="calc-step__no">
            ③
          </text>
          <view class="calc-step__body">
            <view class="calc-step__row calc-step__row--em">
              <text class="calc-step__label">
                累计应纳税所得额
              </text>
              <text class="calc-step__val tabular-nums">
                {{ fmt(breakdown.cumulativeTaxableIncome) }}
              </text>
            </view>
          </view>
        </view>

        <view class="calc-step">
          <text class="calc-step__no">
            ④
          </text>
          <view class="calc-step__body">
            <view class="calc-step__row">
              <text class="calc-step__label">
                累计应纳税额
              </text>
              <text class="calc-step__val tabular-nums">
                {{ fmt(breakdown.cumulativeTaxPayable) }}
              </text>
            </view>
          </view>
        </view>

        <view class="calc-step">
          <text class="calc-step__no">
            ⑤
          </text>
          <view class="calc-step__body">
            <view class="calc-step__row">
              <text class="calc-step__label">
                减去已缴税额
              </text>
              <text class="calc-step__val calc-step__val--minus tabular-nums">
                -{{ fmt(breakdown.cumulativeTaxPaid) }}
              </text>
            </view>
          </view>
        </view>

        <view class="calc-step">
          <text class="calc-step__no">
            ⑥
          </text>
          <view class="calc-step__body">
            <view class="calc-step__row calc-step__row--em">
              <text class="calc-step__label">
                本期应扣个税
              </text>
              <text class="calc-step__val calc-step__val--primary tabular-nums">
                {{ fmt(breakdown.currentPeriodTax) }}
              </text>
            </view>
          </view>
        </view>
      </view>

      <!-- 第三层：完整明细（折叠） -->
      <view class="mt-16rpx bg-white">
        <view
          class="collapse-head"
          @click="showFullBreakdown = !showFullBreakdown"
        >
          <view class="flex items-center gap-16rpx">
            <view class="h-28rpx w-6rpx shrink-0 rounded-4rpx bg-primary" />
            <text class="text-30rpx text-#333 font-600">
              完整计算明细
            </text>
          </view>
          <wd-icon :name="showFullBreakdown ? 'down' : 'up'" size="28rpx" />
        </view>
        <view v-if="showFullBreakdown" class="px-32rpx pb-28rpx">
          <view
            v-for="row in incomeRows"
            :key="row.label"
            class="detail-row"
          >
            <text class="detail-label">
              {{ row.label }}
            </text>
            <text class="detail-val tabular-nums">
              {{ row.value }}
            </text>
          </view>

          <view class="detail-divider" />

          <view
            v-for="row in taxRows"
            :key="`tax-${row.label}`"
            class="detail-row"
          >
            <text class="detail-label">
              {{ row.label }}
            </text>
            <text class="detail-val tabular-nums">
              {{ row.value }}
            </text>
          </view>
        </view>
      </view>

      <!-- 第四层：工资条原始数据（折叠） -->
      <view class="mt-16rpx bg-white">
        <view
          class="collapse-head"
          @click="showPayslipRaw = !showPayslipRaw"
        >
          <view class="flex items-center gap-16rpx">
            <view class="h-28rpx w-6rpx shrink-0 rounded-4rpx bg-primary" />
            <text class="text-30rpx text-#333 font-600">
              工资条原始数据
            </text>
          </view>
          <wd-icon :name="showPayslipRaw ? 'down' : 'up'" size="28rpx" />
        </view>
        <view v-if="showPayslipRaw" class="px-32rpx pb-28rpx">
          <view
            v-for="key in fieldKeys"
            :key="key"
            class="detail-row"
          >
            <text class="detail-label">
              {{ PAYSLIP_FIELD_LABELS[key] }}
            </text>
            <text class="detail-val tabular-nums">
              {{ fmt(record[key]) }}
            </text>
          </view>
        </view>
      </view>
    </template>

    <view v-else-if="loadFailed" class="px-32rpx pt-80rpx">
      <wd-empty tip="记录不存在或加载失败" />
    </view>
  </view>
</template>

<style scoped lang="scss">
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
}

.calc-step {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 2rpx solid #f5f5f5;
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

.calc-step__row--em .calc-step__label,
.calc-step__row--em .calc-step__val {
  font-weight: 500;
  color: #333;
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
  color: var(--wot-warning-main);
}

.calc-step__val--primary {
  color: var(--wot-primary-6);
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

.detail-row--footer {
  padding-bottom: 8rpx;
}

.detail-label {
  flex-shrink: 0;
  font-size: 26rpx;
  color: #333;
}

.detail-label--em {
  color: #333;
  font-weight: 500;
}

.detail-val {
  font-size: 26rpx;
  color: #333;
  text-align: right;
}

.detail-val--em {
  font-weight: 500;
}

.detail-divider {
  height: 2rpx;
  background: #f0f0f0;
  margin: 4rpx 0;
}
</style>

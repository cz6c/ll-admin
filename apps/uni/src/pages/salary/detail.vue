<script lang="ts" setup>
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { salaryOptionLabel, YEAR_END_TAX_OPTIONS } from '@/constants/salaryFormOptions'
import { useSalaryCalcStore } from '@/store/salaryCalc'
import { useSalaryHistoryStore } from '@/store/salaryHistory'

defineOptions({ name: 'SalaryDetail' })

definePage({
  style: {
    navigationBarTitleText: '薪资明细',
  },
})

const store = useSalaryCalcStore()
const salaryHistoryStore = useSalaryHistoryStore()

/** 从「历史记录」进入时携带 id，展示该条快照；从「查看明细」进入无 id，用当前 store */
const historyId = ref('')

onLoad((options?: Record<string, string>) => {
  historyId.value = options?.id ? decodeURIComponent(options.id) : ''
})

const historyItem = computed(() => {
  if (!historyId.value)
    return null
  return salaryHistoryStore.findById(historyId.value) ?? null
})

const r = computed(() => {
  const snap = historyItem.value?.snapshot
  if (snap)
    return snap.result
  return store.result
})

const detailInput = computed(() => {
  const snap = historyItem.value?.snapshot
  if (snap)
    return snap.input
  return store.input
})

const yearEndTaxLabel = computed(() =>
  salaryOptionLabel(YEAR_END_TAX_OPTIONS, detailInput.value.yearEndTaxMode),
)

const annualInsPersonalP = computed(() => r.value.fiveInsFundPersonalMonthly * 12)

function fmt(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2)
}

/** 综合所得个税税率表（全年应纳税所得额） */
const INCOME_TAX_BRACKETS = [
  { level: 1, range: '不超过36000元的', rate: 3, deduction: 0 },
  { level: 2, range: '超过36000元至144000元的部分', rate: 10, deduction: 2520 },
  { level: 3, range: '超过144000元至300000元的部分', rate: 20, deduction: 16920 },
  { level: 4, range: '超过300000元至420000元的部分', rate: 25, deduction: 31920 },
  { level: 5, range: '超过420000元至660000元的部分', rate: 30, deduction: 52920 },
  { level: 6, range: '超过660000元至960000元的部分', rate: 35, deduction: 85920 },
  { level: 7, range: '超过960000元的部分', rate: 45, deduction: 181920 },
] as const
</script>

<template>
  <view class="page-shell pb-48rpx">
    <view class="hero bg-primary px-32rpx pb-40rpx pt-safe">
      <view class="pt-24rpx text-center">
        <text class="text-72rpx text-white font-semibold leading-none tabular-nums">
          {{ fmt(r.annualTakeHome) }}
        </text>
        <view class="ml-16rpx mt-16rpx inline-block rounded-8rpx bg-white/20 px-16rpx py-2rpx">
          <text class="text-24rpx text-white/95">
            到手年薪
          </text>
        </view>
      </view>
    </view>

    <view class="px-24rpx -mt-24rpx">
      <view class="card-rounded p-24rpx">
        <view class="summary-grid">
          <view class="sum-cell">
            <text class="sum-val tabular-nums">
              {{ fmt(r.annualTaxTotal) }}
            </text>
            <text class="sum-lab">
              年度缴税
            </text>
          </view>
          <view class="sum-cell">
            <text class="sum-val tabular-nums">
              {{ fmt(annualInsPersonalP) }}
            </text>
            <text class="sum-lab">
              五险一金（个人）
            </text>
          </view>
        </view>
      </view>

      <view class="mt-40rpx section-title">
        <view class="section-bar" />
        <text>每月到手工资</text>
      </view>
      <view class="mt-16rpx card-rounded">
        <view class="month-table">
          <view class="month-head">
            <view class="month-cell month-cell--narrow">
              <text class="month-head-text">
                月份
              </text>
            </view>
            <view class="month-cell month-cell--grow">
              <text class="month-head-text">
                税前
              </text>
            </view>
            <view class="month-cell month-cell--grow">
              <text class="month-head-text">
                五险一金
              </text>
            </view>
            <view class="month-cell month-cell--grow">
              <text class="month-head-text">
                个人所得税
              </text>
            </view>
            <view class="month-cell month-cell--grow">
              <text class="month-head-text">
                税后
              </text>
            </view>
          </view>
          <view
            v-for="(row, idx) in r.monthlyRows"
            :key="row.month"
            class="month-row"
            :class="idx % 2 === 1 ? 'month-row--alt' : ''"
          >
            <view class="month-cell month-cell--narrow">
              <text class="month-body-text">
                {{ row.month }}月
              </text>
            </view>
            <view class="month-cell month-cell--grow">
              <text class="month-num tabular-nums">
                {{ fmt(row.preTax) }}
              </text>
            </view>
            <view class="month-cell month-cell--grow">
              <text class="month-num tabular-nums">
                {{ fmt(row.fiveInsFundPersonal) }}
              </text>
            </view>
            <view class="month-cell month-cell--grow">
              <text class="month-num tabular-nums">
                {{ fmt(row.tax) }}
              </text>
            </view>
            <view class="month-cell month-cell--grow">
              <text class="month-num text-primary tabular-nums">
                {{ fmt(row.postTax) }}
              </text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="detailInput.yearEndBonus > 0" class="mt-40rpx section-title">
        <view class="section-bar" />
        <text>年终奖</text>
      </view>
      <view v-if="detailInput.yearEndBonus > 0" class="mt-24rpx card-rounded p-24rpx text-26rpx leading-relaxed">
        <text class="text-#666">
          年终奖 {{ fmt(detailInput.yearEndBonus) }}，个税 {{ fmt(r.yearEndBonusTax) }}，到手 {{ fmt(r.yearEndBonusNet) }}
          （{{ yearEndTaxLabel }}）
        </text>
      </view>

      <view class="mt-40rpx section-title">
        <view class="section-bar" />
        <text>个人所得税税率表（综合所得适用）</text>
      </view>
      <view class="mt-16rpx card-rounded">
        <view class="pit-table">
          <view class="pit-head">
            <view class="pit-cell pit-cell--level">
              <text class="pit-head-text">
                级数
              </text>
            </view>
            <view class="pit-cell pit-cell--range">
              <text class="pit-head-text">
                全年应纳税所得额
              </text>
            </view>
            <view class="pit-cell pit-cell--rate">
              <text class="pit-head-text">
                税率(%)
              </text>
            </view>
            <view class="pit-cell pit-cell--deduct">
              <text class="pit-head-text">
                速算扣除数
              </text>
            </view>
          </view>
          <view
            v-for="(row, idx) in INCOME_TAX_BRACKETS"
            :key="row.level"
            class="pit-row"
            :class="idx % 2 === 1 ? 'pit-row--alt' : ''"
          >
            <view class="pit-cell pit-cell--level">
              <text class="pit-body-text tabular-nums">
                {{ row.level }}
              </text>
            </view>
            <view class="pit-cell pit-cell--range">
              <text class="pit-body-text pit-body-text--range">
                {{ row.range }}
              </text>
            </view>
            <view class="pit-cell pit-cell--rate">
              <text class="pit-num tabular-nums">
                {{ row.rate }}
              </text>
            </view>
            <view class="pit-cell pit-cell--deduct">
              <text class="pit-num tabular-nums">
                {{ row.deduction }}
              </text>
            </view>
          </view>
        </view>
      </view>

      <view class="mt-24rpx px-16rpx text-center text-22rpx text-#999 leading-relaxed">
        注：计算结果仅供参考
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.hero {
  padding-bottom: 56rpx;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24rpx 16rpx;
}
.sum-cell {
  text-align: center;
}
.sum-val {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
}
.sum-lab {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #999;
}

/* 小程序端 flex 子节点不能用 text，必须用 view 做单元格 */
.month-table {
  width: 100%;
}
.month-head,
.month-row {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
}
.month-head {
  padding: 20rpx 0;
  border-bottom: 2rpx solid #f0f0f0;
}
.month-row {
  padding: 20rpx 0;
  min-height: 88rpx;
}
.month-row--alt {
  background: #fafafa;
}
.month-cell {
  flex-shrink: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.month-cell--narrow {
  width: 14%;
  padding-left: 16rpx;
}
.month-cell--grow {
  flex: 1;
  width: 0;
  min-width: 0;
  align-items: center;
}
.month-head-text {
  font-size: 22rpx;
  color: #999;
  text-align: center;
}
.month-cell--narrow .month-head-text {
  text-align: left;
}
.month-body-text {
  font-size: 26rpx;
  color: #333;
}
.month-num {
  font-size: 26rpx;
  color: #333;
  text-align: center;
}

.pit-table {
  width: 100%;
}
.pit-head,
.pit-row {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
}
.pit-head {
  padding: 20rpx 0;
  border-bottom: 2rpx solid #f0f0f0;
}
.pit-row {
  padding: 20rpx 0;
  min-height: 88rpx;
}
.pit-row--alt {
  background: #fafafa;
}
.pit-cell {
  flex-shrink: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.pit-cell--level {
  width: 14%;
  padding-left: 16rpx;
}
.pit-cell--range {
  flex: 1;
  width: 0;
  min-width: 0;
  padding-right: 12rpx;
}
.pit-cell--rate {
  width: 18%;
  align-items: center;
}
.pit-cell--deduct {
  width: 24%;
  align-items: center;
}
.pit-head-text {
  font-size: 22rpx;
  color: #999;
  text-align: center;
}
.pit-cell--level .pit-head-text {
  text-align: left;
}
.pit-cell--range .pit-head-text {
  text-align: left;
}
.pit-body-text {
  font-size: 26rpx;
  color: #333;
}
.pit-body-text--range {
  line-height: 1.4;
}
.pit-num {
  font-size: 26rpx;
  color: #333;
  text-align: center;
}
</style>

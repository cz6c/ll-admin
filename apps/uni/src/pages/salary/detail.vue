<script lang="ts" setup>
/**
 * 年度测算明细页
 * 主流程：历史 id / 当前 store → calcSalary → 蓝卡汇总 + 月度柱状图 + 折叠计算明细
 * 图表：qiun-data-charts（uCharts）；角标等无 wd-icon 时用 UnoCSS carbon 字体图标
 */
import { onLoad, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { useSalaryCalcStore } from '@/store/salaryCalc'
import { useSalaryHistoryStore } from '@/store/salaryHistory'
import { formatSalaryAmount, formatSalaryWan } from '@/utils/formatSalaryAmount'
import { calcSalary } from '@/utils/salaryCalculator'

defineOptions({ name: 'SalaryDetail' })

definePage({
  style: {
    navigationBarTitleText: '年度测算明细',
  },
})

const store = useSalaryCalcStore()
const salaryHistoryStore = useSalaryHistoryStore()

/** 从「历史记录」进入时携带 id，展示该条快照；从「查看明细」进入无 id，用当前 store */
const historyId = ref('')
/** 计算明细默认展开，与设计稿一致 */
const showBreakdown = ref(true)

onLoad((options?: Record<string, string>) => {
  historyId.value = options?.id ? decodeURIComponent(options.id) : ''
})

onShow(() => {
  if (!historyId.value)
    return
  if (salaryHistoryStore.findById(historyId.value))
    return
  salaryHistoryStore.fetchHistory().catch(() => {
    uni.showToast({ title: '历史记录加载失败', icon: 'none' })
  })
})

const historyItem = computed(() => {
  if (!historyId.value)
    return null
  return salaryHistoryStore.findById(historyId.value) ?? null
})

const detailInput = computed(() => {
  if (historyItem.value)
    return historyItem.value.input
  return store.input
})

const r = computed(() => {
  if (historyItem.value)
    return calcSalary(detailInput.value)
  return store.result
})

const taxRateLabel = computed(() => {
  const pct = Math.round(r.value.applicableTaxRate * 10000) / 100
  return Number.isInteger(pct) ? `${pct}%` : `${pct}%`
})

/** 明细行：deduct 为 true 时有额显示红色负号 */
interface BreakdownRow {
  label: string
  value: number
  deduct?: boolean
}

const breakdownRows = computed((): BreakdownRow[] => {
  const input = detailInput.value
  const result = r.value
  return [
    { label: '应发总额（税前）', value: result.annualPreTaxTotal },
    { label: '社保（个人）', value: result.ssPersonalMonthly * 12, deduct: true },
    { label: '公积金（个人）', value: result.hfPersonalMonthly * 12, deduct: true },
    { label: '专项附加扣除', value: input.specialDeductionMonthly * 12, deduct: true },
    { label: '应纳税所得额', value: result.annualTaxableIncome },
    { label: '累计应纳税额', value: result.annualTaxTotal, deduct: true },
  ]
})

const chartData = computed(() => ({
  categories: r.value.monthlyRows.map(row => `${row.month}月`),
  series: [
    {
      name: '税后',
      data: r.value.monthlyRows.map(row => row.postTax),
    },
  ],
}))

/** 柱状图：主色柱、弱化坐标，贴近稿面留白 */
const chartOpts = {
  color: ['#1688ff'],
  padding: [16, 8, 0, 8],
  legend: { show: false },
  dataLabel: false,
  enableScroll: false,
  xAxis: {
    disableGrid: true,
    fontSize: 10,
    fontColor: '#999999',
    rotateLabel: false,
    marginTop: 6,
  },
  yAxis: {
    disabled: true,
    disableGrid: true,
  },
  extra: {
    column: {
      type: 'group',
      width: 12,
      activeBgColor: '#1688ff',
      activeBgOpacity: 0.08,
      barBorderRadius: [6, 6, 0, 0],
    },
  },
}

function fmtYen(n: number) {
  return `¥${formatSalaryAmount(n)}`
}

function fmtBreakdownValue(row: BreakdownRow) {
  if (row.deduct) {
    if (row.value <= 0)
      return fmtYen(0)
    return `-¥${formatSalaryAmount(row.value)}`
  }
  return fmtYen(row.value)
}
</script>

<template>
  <view class="page-shell pb-safe">
    <view class="p-24rpx">
      <!-- 蓝色汇总卡 -->
      <view class="hero-card">
        <view class="hero-card__top">
          <view class="hero-card__main">
            <text class="hero-card__label">
              预估年度税后收入
            </text>
            <text class="hero-card__amount tabular-nums">
              ¥{{ formatSalaryWan(r.annualTakeHome) }}
            </text>
            <view class="hero-card__badges">
              <view class="hero-badge">
                <view class="i-carbon-arrow-up-right h-24rpx w-24rpx text-white/90" />
                <text class="hero-badge__text">
                  税前 ¥{{ formatSalaryWan(r.annualPreTaxTotal) }}
                </text>
              </view>
              <view class="hero-badge">
                <view class="i-carbon-arrow-down-right h-24rpx w-24rpx text-white/90" />
                <text class="hero-badge__text">
                  个税 ¥{{ formatSalaryAmount(r.annualTaxTotal) }}
                </text>
              </view>
            </view>
          </view>
          <view class="i-carbon-calculator hero-card__icon" />
        </view>

        <view class="hero-card__footer">
          <view class="hero-stat">
            <text class="hero-stat__lab">
              月薪基数
            </text>
            <text class="hero-stat__val tabular-nums">
              ¥{{ formatSalaryAmount(detailInput.preTaxMonthly) }}
            </text>
          </view>
          <view class="hero-stat hero-stat--mid">
            <text class="hero-stat__lab">
              适用税率
            </text>
            <text class="hero-stat__val tabular-nums">
              {{ taxRateLabel }}
            </text>
          </view>
          <view class="hero-stat">
            <text class="hero-stat__lab">
              速算扣除
            </text>
            <text class="hero-stat__val tabular-nums">
              ¥{{ formatSalaryAmount(r.quickDeduction) }}
            </text>
          </view>
        </view>
      </view>

      <!-- 月度税后柱状图 -->
      <view class="mt-24rpx card-rounded p-28rpx">
        <view class="mb-8rpx flex items-center justify-between">
          <text class="text-30rpx text-#333 font-600">
            月度税后收入
          </text>
          <text class="text-22rpx text-#999">
            单位：元
          </text>
        </view>
        <view class="charts-box">
          <qiun-data-charts
            type="column"
            :opts="chartOpts"
            :chart-data="chartData"
            :canvas2d="true"
            background="none"
          />
        </view>
      </view>

      <!-- 计算明细折叠 -->
      <view class="mt-24rpx card-rounded">
        <view
          class="breakdown-head"
          @click="showBreakdown = !showBreakdown"
        >
          <text class="text-30rpx text-#333 font-600">
            计算明细
          </text>
          <view
            class="h-32rpx w-32rpx text-#c0c4cc"
            :class="showBreakdown ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'"
          />
        </view>
        <view v-if="showBreakdown" class="breakdown-body">
          <view
            v-for="row in breakdownRows"
            :key="row.label"
            class="breakdown-row"
          >
            <text class="breakdown-row__lab">
              {{ row.label }}
            </text>
            <text
              class="breakdown-row__val tabular-nums"
              :class="row.deduct && row.value > 0 ? 'is-deduct' : ''"
            >
              {{ fmtBreakdownValue(row) }}
            </text>
          </view>
          <view class="breakdown-dash" />
          <view class="breakdown-row breakdown-row--total">
            <text class="breakdown-row__lab breakdown-row__lab--em">
              年度税后合计
            </text>
            <text class="breakdown-row__val breakdown-row__val--primary tabular-nums">
              {{ fmtYen(r.annualTakeHome) }}
            </text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.hero-card {
  position: relative;
  overflow: hidden;
  border-radius: 24rpx;
  background: var(--wot-primary-6);
  padding: 36rpx 32rpx 0;
  color: #fff;
}

.hero-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  padding-bottom: 28rpx;
}

.hero-card__main {
  flex: 1;
  min-width: 0;
}

.hero-card__label {
  display: block;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.4;
}

.hero-card__amount {
  display: block;
  margin-top: 12rpx;
  font-size: 56rpx;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 1rpx;
}

.hero-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.hero-badge {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.18);
}

.hero-badge__text {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.95);
  line-height: 1.3;
}

.hero-card__icon {
  flex-shrink: 0;
  width: 96rpx;
  height: 96rpx;
  margin-top: 8rpx;
  color: rgba(255, 255, 255, 0.22);
}

.hero-card__footer {
  display: flex;
  align-items: stretch;
  border-top: 1rpx solid rgba(255, 255, 255, 0.22);
  padding: 24rpx 0 28rpx;
}

.hero-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.hero-stat--mid {
  border-left: 1rpx solid rgba(255, 255, 255, 0.22);
  border-right: 1rpx solid rgba(255, 255, 255, 0.22);
}

.hero-stat__lab {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.75);
}

.hero-stat__val {
  font-size: 28rpx;
  font-weight: 600;
  color: #fff;
}

.charts-box {
  width: 100%;
  height: 360rpx;
}

.breakdown-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx;
}

.breakdown-body {
  padding: 0 32rpx 28rpx;
  border-top: 2rpx solid #f0f0f0;
}

.breakdown-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 20rpx 0;
}

.breakdown-row--total {
  padding-top: 24rpx;
  padding-bottom: 8rpx;
}

.breakdown-row__lab {
  font-size: 28rpx;
  color: #666;
}

.breakdown-row__lab--em {
  color: #333;
  font-weight: 600;
}

.breakdown-row__val {
  font-size: 28rpx;
  color: #333;
  text-align: right;
}

.breakdown-row__val.is-deduct {
  color: var(--wot-danger-main);
}

.breakdown-row__val--primary {
  color: var(--wot-primary-6);
  font-weight: 600;
  font-size: 30rpx;
}

.breakdown-dash {
  height: 0;
  border-top: 2rpx dashed #e8e8e8;
  margin: 4rpx 0;
}
</style>

<script lang="ts" setup>
/**
 * 本年累计对照台账
 * 主流程：拉核对历史 → 按年生成台账 → 与个税 App 逐月对照；已核进详情、待核去核对
 * 入参：year=YYYY（缺省当年）、highlight=YYYY-MM（滚动定位）
 */
import type { YearLedgerRow } from '@/utils/salaryVerifyYearLedger'
import { onLoad, onShow } from '@dcloudio/uni-app'
import dayjs from 'dayjs'
import { computed, nextTick, ref } from 'vue'
import { useSalaryHistoryStore } from '@/store/salaryHistory'
import { formatSalaryAmount } from '@/utils/formatSalaryAmount'
import { previousPayPeriod } from '@/utils/payPeriod'
import {
  buildYearVerifyLedger,
  yearLedgerStatusLabel,
} from '@/utils/salaryVerifyYearLedger'

defineOptions({ name: 'SalaryVerifyYear' })

definePage({
  style: {
    navigationBarTitleText: '本年累计对照',
  },
})

const salaryHistoryStore = useSalaryHistoryStore()
const year = ref(dayjs().year())
const highlightPayPeriod = ref('')
const scrollIntoView = ref('')
const loading = ref(true)

onLoad((options?: Record<string, string>) => {
  const y = Number(options?.year)
  if (Number.isFinite(y) && y >= 2000 && y <= 2100)
    year.value = y
  const hl = String(options?.highlight || '').trim()
  if (/^\d{4}-\d{2}$/.test(hl))
    highlightPayPeriod.value = hl
})

onShow(() => {
  void loadLedger()
})

async function loadLedger() {
  loading.value = true
  try {
    await salaryHistoryStore.fetchHistory()
  }
  catch {
    // 列表失败仍尝试用本地 store 渲染，避免整页空白
  }
  finally {
    loading.value = false
    await nextTick()
    if (highlightPayPeriod.value) {
      scrollIntoView.value = ''
      await nextTick()
      scrollIntoView.value = `row-${highlightPayPeriod.value}`
    }
  }
}

const ledger = computed(() =>
  buildYearVerifyLedger(salaryHistoryStore.verifyItems, year.value),
)

function fmt(n: number | null) {
  if (n == null)
    return '—'
  return formatSalaryAmount(n)
}

/** 状态列配色：不用警告色（报税修正只靠计入累计金额的橙色区分） */
function statusClass(status: YearLedgerRow['status']) {
  return `ledger-row__status--${status}`
}

function onRowClick(row: YearLedgerRow) {
  if (row.status === 'future')
    return
  // 已核：navigateTo 详情，返回仍回对照页
  if ((row.status === 'matched' || row.status === 'mismatched' || row.status === 'declared') && row.recordId) {
    uni.navigateTo({
      url: `/pages/salary/verify-detail?id=${encodeURIComponent(row.recordId)}`,
    })
    return
  }
  // 待核：navigateTo 录入；保存侧 redirectTo 详情，栈为 对照→详情
  if (row.status === 'missing') {
    uni.navigateTo({
      url: `/pages/salary/verify?payPeriod=${encodeURIComponent(row.payPeriod)}`,
    })
  }
}

function goEmptyVerify() {
  const pp = ledger.value.emptyCtaPayPeriod || previousPayPeriod()
  uni.navigateTo({
    url: `/pages/salary/verify?payPeriod=${encodeURIComponent(pp)}`,
  })
}
</script>

<template>
  <view class="page-shell pb-safe">
    <view v-if="loading && !salaryHistoryStore.verifyItems.length" class="px-32rpx py-48rpx text-center text-28rpx text-#999">
      加载中…
    </view>

    <template v-else>
      <view class="px-24rpx pt-24rpx">
        <view class="card-rounded p-28rpx">
          <text class="text-30rpx text-#333 font-600">
            {{ ledger.title }}
          </text>
          <text class="mt-12rpx block text-24rpx text-#999 leading-relaxed">
            与个人所得税 App「收入纳税明细」对照
          </text>
        </view>
      </view>

      <view v-if="!ledger.hasAnyVerified" class="px-24rpx pt-24rpx">
        <view class="flex flex-col items-center card-rounded px-32rpx py-80rpx">
          <text class="text-30rpx text-#333 font-600">
            本年还没有核对记录
          </text>
          <text class="mt-12rpx text-26rpx text-#999">
            先核上月工资条，再回来对照累计
          </text>
          <view
            class="ledger-empty-cta mt-40rpx"
            hover-class="ledger-empty-cta--pressed"
            :hover-stay-time="70"
            @click="goEmptyVerify"
          >
            去核对上月
          </view>
        </view>
      </view>

      <scroll-view
        v-else
        class="ledger-scroll mt-16rpx"
        scroll-y
        :scroll-into-view="scrollIntoView"
        scroll-with-animation
      >
        <view class="px-24rpx pb-32rpx">
          <view class="card-rounded overflow-hidden">
            <view class="ledger-head">
              <text class="ledger-head__m">
                月
              </text>
              <text class="ledger-head__col">
                计入累计
              </text>
              <text class="ledger-head__col">
                个税
              </text>
              <text class="ledger-head__col">
                状态
              </text>
            </view>

            <view
              v-for="row in ledger.rows"
              :id="`row-${row.payPeriod}`"
              :key="row.payPeriod"
              class="ledger-row"
              :class="[
                row.status === 'future' ? 'ledger-row--inert' : '',
                highlightPayPeriod === row.payPeriod ? 'ledger-row--hl' : '',
              ]"
              :hover-class="row.status === 'future' ? '' : 'ledger-row--pressed'"
              :hover-stay-time="60"
              @click="onRowClick(row)"
            >
              <text class="ledger-row__m tabular-nums">
                {{ row.month }}
              </text>
              <text
                class="ledger-row__col tabular-nums"
                :class="{ 'ledger-row__col--declared': row.useDeclared }"
              >
                {{ fmt(row.cumulativePreTax) }}
              </text>
              <text class="ledger-row__col tabular-nums">
                {{ fmt(row.slipTax) }}
              </text>
              <text class="ledger-row__col" :class="statusClass(row.status)">
                {{ yearLedgerStatusLabel(row.status) }}
              </text>
            </view>

            <view class="ledger-foot">
              <text class="ledger-foot__label">
                合计
              </text>
              <text class="ledger-foot__col tabular-nums">
                {{ fmt(ledger.sumCumulativePreTax) }}
              </text>
              <text class="ledger-foot__col tabular-nums">
                {{ fmt(ledger.sumSlipTax) }}
              </text>
              <text class="ledger-foot__col" />
            </view>
          </view>
        </view>
      </scroll-view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.ledger-scroll {
  height: calc(100vh - 200rpx);
}

.ledger-empty-cta {
  padding: 20rpx 48rpx;
  border-radius: 999rpx;
  background: var(--wot-primary-6);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
}

.ledger-empty-cta--pressed {
  opacity: 0.86;
  transform: scale(0.98);
}

.ledger-head,
.ledger-row,
.ledger-foot {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 20rpx 20rpx;
}

.ledger-head {
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.06);
}

.ledger-head__m,
.ledger-row__m {
  width: 48rpx;
  flex-shrink: 0;
  font-size: 24rpx;
  color: #999;
  text-align: center;
}

.ledger-head__col,
.ledger-row__col,
.ledger-foot__col {
  flex: 1;
  min-width: 0;
  font-size: 22rpx;
  color: #999;
  text-align: right;
}

.ledger-row {
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.04);
}

.ledger-row__col {
  color: #666;
  font-size: 24rpx;
}

/* 报税修正：仅金额用警告色；状态列保持中性/语义色，不用警告色 */
.ledger-row__col--declared {
  color: var(--wot-warning-main);
  font-weight: 600;
}

.ledger-row--pressed {
  background: rgba(0, 0, 0, 0.03);
}

.ledger-row--inert {
  opacity: 0.45;
}

.ledger-row--hl {
  background: color-mix(in srgb, var(--wot-primary-6) 8%, transparent);
}

.ledger-row__status--matched {
  color: var(--wot-success-main);
}

.ledger-row__status--mismatched {
  color: var(--wot-warning-main);
}

.ledger-row__status--declared {
  color: var(--wot-success-main);
}

.ledger-row__status--missing {
  color: var(--wot-primary-6);
}

.ledger-row__status--future {
  color: #c0c4cc;
}

.ledger-foot {
  background: rgba(0, 0, 0, 0.02);
  padding-top: 24rpx;
  padding-bottom: 24rpx;
}

.ledger-foot__label {
  width: 48rpx;
  flex-shrink: 0;
  font-size: 20rpx;
  color: #999;
  line-height: 1.2;
  text-align: center;
}

.ledger-foot__col {
  color: #333;
  font-weight: 600;
  font-size: 24rpx;
}
</style>

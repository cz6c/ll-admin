<script lang="ts" setup>
import type { SalaryHistoryItem } from '@/store/salaryHistory'
import type { PayslipVerifyRecord } from '@/store/salaryVerifyHistory'
import type { PayslipVerifyResult } from '@/utils/salaryCalculator'
import type { PayslipFieldKey } from '@/utils/salarySlipFieldMap'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useQueue } from '@wot-ui/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useSalaryHistoryStore } from '@/store/salaryHistory'
import { useSalaryVerifyHistoryStore } from '@/store/salaryVerifyHistory'
import { formatHistoryTime } from '@/utils/formatTime'
import { formatPayPeriodLabel } from '@/utils/payPeriod'
import { computeVerifyForRecord, formatVerifyAbnormalSummary } from '@/utils/payslipVerify'
import { calcSalary } from '@/utils/salaryCalculator'
import { PAYSLIP_FIELD_LABELS } from '@/utils/salarySlipFieldMap'

defineOptions({ name: 'SalaryHistory' })

const { closeOutside } = useQueue()

definePage({
  style: {
    navigationBarTitleText: '历史记录',
  },
})

type HistoryTab = 'calc' | 'verify'

const salaryHistoryStore = useSalaryHistoryStore()
const verifyHistoryStore = useSalaryVerifyHistoryStore()
const { items: calcList } = storeToRefs(salaryHistoryStore)
const { items: verifyList } = storeToRefs(verifyHistoryStore)

const activeTab = ref<HistoryTab>('verify')
const calcSearchInput = ref('')
const calcSearchKeyword = ref('')
const verifySearchInput = ref('')
const verifySearchKeyword = ref('')

const WORKBENCH_KEY = '1111'

const fieldKeys: PayslipFieldKey[] = [
  'preTaxMonthly',
  'ssPersonalAmount',
  'hfPersonalAmount',
  'specialDeductionMonthly',
  'personalIncomeTax',
  'postTaxMonthly',
]

const verifyResultMap = computed(() => {
  const map = new Map<string, PayslipVerifyResult>()
  for (const item of verifyList.value)
    map.set(item.id, computeVerifyForRecord(item, verifyList.value))
  return map
})

onLoad((options?: Record<string, string>) => {
  if (options?.tab === 'calc' || options?.tab === 'verify')
    activeTab.value = options.tab
})

onShow(async () => {
  try {
    await Promise.all([
      salaryHistoryStore.fetchHistory(calcSearchKeyword.value || undefined),
      verifyHistoryStore.fetchHistory(verifySearchKeyword.value || undefined),
    ])
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : '历史记录加载失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
})

function onCalcSearch({ value }: { value: string }) {
  const val = value.trim()
  if (val === WORKBENCH_KEY) {
    calcSearchInput.value = ''
    calcSearchKeyword.value = ''
    uni.navigateTo({ url: '/pages/workbench/workbench' })
    return
  }
  calcSearchKeyword.value = val
  salaryHistoryStore.fetchHistory(val || undefined).catch((err) => {
    const msg = err instanceof Error ? err.message : '历史记录加载失败'
    uni.showToast({ title: msg, icon: 'none' })
  })
}

function onCalcSearchClear() {
  calcSearchKeyword.value = ''
  salaryHistoryStore.fetchHistory().catch((err) => {
    const msg = err instanceof Error ? err.message : '历史记录加载失败'
    uni.showToast({ title: msg, icon: 'none' })
  })
}

function onVerifySearch({ value }: { value: string }) {
  verifySearchKeyword.value = value.trim()
  verifyHistoryStore.fetchHistory(verifySearchKeyword.value).catch((err) => {
    const msg = err instanceof Error ? err.message : '历史记录加载失败'
    uni.showToast({ title: msg, icon: 'none' })
  })
}

function onVerifySearchClear() {
  verifySearchKeyword.value = ''
  verifyHistoryStore.fetchHistory().catch((err) => {
    const msg = err instanceof Error ? err.message : '历史记录加载失败'
    uni.showToast({ title: msg, icon: 'none' })
  })
}

function openCalcDetail(item: SalaryHistoryItem) {
  uni.navigateTo({ url: `/pages/salary/detail?id=${encodeURIComponent(item.id)}` })
}

function openVerifyDetail(item: PayslipVerifyRecord) {
  uni.navigateTo({ url: `/pages/salary/verify-detail?id=${encodeURIComponent(item.id)}` })
}

function fmt(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2)
}

function calcHistoryTitle(item: SalaryHistoryItem) {
  return `每月税前${fmt(item.input.preTaxMonthly)}`
}

function calcHistoryAnnualTakeHome(item: SalaryHistoryItem) {
  return calcSalary(item.input).annualTakeHome
}

function getVerifyResult(item: PayslipVerifyRecord): PayslipVerifyResult {
  return verifyResultMap.value.get(item.id)!
}

function confirmDeleteCalc(item: SalaryHistoryItem) {
  uni.showModal({
    title: '删除记录',
    content: '确定删除这条年薪测算记录吗？',
    async success(res) {
      if (!res.confirm)
        return
      try {
        await salaryHistoryStore.removeById(item.id)
        uni.showToast({ title: '已删除', icon: 'success' })
      }
      catch (err) {
        const msg = err instanceof Error ? err.message : '删除失败'
        uni.showToast({ title: msg, icon: 'none' })
      }
    },
  })
}

function confirmDeleteVerify(item: PayslipVerifyRecord) {
  uni.showModal({
    title: '删除记录',
    content: `确定删除 ${formatPayPeriodLabel(item.payPeriod)} 的核对记录吗？`,
    async success(res) {
      if (!res.confirm)
        return
      try {
        await verifyHistoryStore.removeById(item.id)
        uni.showToast({ title: '已删除', icon: 'success' })
      }
      catch (err) {
        const msg = err instanceof Error ? err.message : '删除失败'
        uni.showToast({ title: msg, icon: 'none' })
      }
    },
  })
}
</script>

<template>
  <view class="page-shell pb-safe" @click="closeOutside">
    <wd-tabs v-model="activeTab" animated custom-class="history-tabs">
      <wd-tab name="calc" title="年薪测算" />
      <wd-tab name="verify" title="月薪核对" />
    </wd-tabs>

    <view class="p-24rpx">
      <template v-if="activeTab === 'calc'">
        <wd-search
          v-model="calcSearchInput"
          placeholder="搜索历史记录"
          hide-cancel
          variant="light"
          custom-class="search mb-16rpx"
          @search="onCalcSearch"
          @clear="onCalcSearchClear"
        />

        <view v-if="calcList.length > 0" class="px-8rpx pb-16rpx">
          <text class="text-26rpx text-#999">
            {{ calcSearchKeyword ? `找到 ${calcList.length} 条` : `共 ${calcList.length} 条` }}
          </text>
        </view>

        <wd-empty
          v-if="calcList.length === 0 "
          :tip="!calcSearchKeyword ? '暂无年薪测算记录' : '未找到匹配的历史记录'"
        />

        <template v-else>
          <view v-for="item in calcList" :key="item.id" class="mb-20rpx">
            <wd-swipe-action>
              <view class="card-rounded p-28rpx" @click="openCalcDetail(item)">
                <view class="flex items-start justify-between gap-16rpx">
                  <view class="min-w-0 flex-1">
                    <view class="text-30rpx text-#333 font-medium">
                      {{ calcHistoryTitle(item) }}
                    </view>
                    <view class="mt-12rpx text-24rpx text-#999">
                      {{ formatHistoryTime(item.savedAt) }}
                    </view>
                  </view>
                  <view class="shrink-0 text-right">
                    <view class="text-32rpx text-primary font-semibold tabular-nums">
                      ¥{{ fmt(calcHistoryAnnualTakeHome(item)) }}
                    </view>
                    <view class="mt-8rpx text-22rpx text-#999">
                      到手年薪
                    </view>
                  </view>
                </view>
              </view>
              <template #right>
                <view class="h-full flex">
                  <view
                    class="history-swipe-del box-border h-full min-h-144rpx center px-40rpx"
                    @click.stop="confirmDeleteCalc(item)"
                  >
                    <text class="text-28rpx text-white">
                      删除
                    </text>
                  </view>
                </view>
              </template>
            </wd-swipe-action>
          </view>
        </template>
      </template>

      <template v-else>
        <wd-search
          v-model="verifySearchInput"
          placeholder="搜索历史记录"
          hide-cancel
          variant="light"
          custom-class="search mb-16rpx"
          @search="onVerifySearch"
          @clear="onVerifySearchClear"
        />

        <view v-if="verifyList.length > 0" class="px-8rpx pb-16rpx">
          <text class="text-26rpx text-#999">
            {{ verifySearchKeyword ? `找到 ${verifyList.length} 条` : `共 ${verifyList.length} 条` }}
          </text>
        </view>

        <wd-empty
          v-if="verifyList.length === 0"
          :tip="!verifySearchKeyword ? '暂无月薪核对记录' : '未找到匹配的历史记录'"
        />

        <template v-else>
          <view v-for="item in verifyList" :key="item.id" class="mb-20rpx">
            <wd-swipe-action>
              <view class="card-rounded p-28rpx" @click="openVerifyDetail(item)">
                <view class="flex items-center justify-between gap-16rpx">
                  <view class="text-30rpx text-#333 font-medium">
                    {{ formatPayPeriodLabel(item.payPeriod) }}
                  </view>
                  <wd-tag
                    :type="getVerifyResult(item).overallMatch ? 'success' : 'warning'"
                    variant="light"
                    size="medium"
                    custom-class="shrink-0"
                  >
                    {{ getVerifyResult(item).overallMatch ? '核对无误' : '异常' }}
                  </wd-tag>
                </view>

                <view class="mt-20rpx">
                  <view
                    v-for="key in fieldKeys"
                    :key="key"
                    class="history-field-row"
                  >
                    <text class="history-field-label">
                      {{ PAYSLIP_FIELD_LABELS[key] }}
                    </text>
                    <text class="history-field-val tabular-nums">
                      ¥{{ fmt(item[key]) }}
                    </text>
                  </view>
                </view>

                <view
                  v-if="!getVerifyResult(item).overallMatch"
                  class="history-abnormal mt-20rpx"
                >
                  <text class="history-abnormal__text">
                    {{ formatVerifyAbnormalSummary(getVerifyResult(item)) }}
                  </text>
                </view>

                <view class="mt-16rpx text-24rpx text-#999">
                  {{ formatHistoryTime(item.savedAt) }}
                </view>
              </view>
              <template #right>
                <view class="h-full flex">
                  <view
                    class="history-swipe-del box-border h-full min-h-144rpx center px-40rpx"
                    @click.stop="confirmDeleteVerify(item)"
                  >
                    <text class="text-28rpx text-white">
                      删除
                    </text>
                  </view>
                </view>
              </template>
            </wd-swipe-action>
          </view>
        </template>
      </template>
    </view>
  </view>
</template>

<style scoped lang="scss">
:deep(.search) {
  padding: 0 !important;
  background: none !important;
}

.history-swipe-del {
  background: var(--wot-danger-main);
}

.history-field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 0;
  font-size: 26rpx;
}

.history-field-label {
  color: #666;
}

.history-field-val {
  color: #333;
}

.history-abnormal {
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  background: var(--wot-warning-surface);
  border: 2rpx solid var(--wot-warning-particular);
}

.history-abnormal__text {
  font-size: 24rpx;
  color: var(--wot-warning-main);
  line-height: 1.55;
}
</style>

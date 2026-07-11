<script lang="ts" setup>
import type { PayslipVerifyRecord } from '@/store/salaryVerifyHistory'
import type { PayslipVerifyResult } from '@/utils/salaryCalculator'
import type { PayslipFieldKey } from '@/utils/salarySlipFieldMap'
import { onShow } from '@dcloudio/uni-app'
import { useQueue } from '@wot-ui/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useSalaryVerifyHistoryStore } from '@/store/salaryVerifyHistory'
import { formatPayPeriodLabel } from '@/utils/payPeriod'
import { computeVerifyForRecord, formatVerifyAbnormalSummary } from '@/utils/payslipVerify'
import { PAYSLIP_FIELD_LABELS } from '@/utils/salarySlipFieldMap'

defineOptions({ name: 'SalaryVerifyHistory' })

const { closeOutside } = useQueue()

definePage({
  style: {
    navigationBarTitleText: '核对历史',
  },
})

const verifyHistoryStore = useSalaryVerifyHistoryStore()
const { items: list } = storeToRefs(verifyHistoryStore)

const searchInput = ref('')
const searchKeyword = ref('')

const fieldKeys: PayslipFieldKey[] = [
  'preTaxMonthly',
  'ssPersonalAmount',
  'hfPersonalAmount',
  'specialDeductionMonthly',
  'personalIncomeTax',
  'postTaxMonthly',
]

const filteredList = computed(() => list.value)

const verifyResultMap = computed(() => {
  const map = new Map<string, PayslipVerifyResult>()
  for (const item of list.value)
    map.set(item.id, computeVerifyForRecord(item, list.value))
  return map
})

onShow(async () => {
  try {
    await verifyHistoryStore.fetchHistory()
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : '历史记录加载失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
})

function onSearch({ value }: { value: string }) {
  searchKeyword.value = value.trim()
  verifyHistoryStore.fetchHistory(searchKeyword.value).catch((err) => {
    const msg = err instanceof Error ? err.message : '历史记录加载失败'
    uni.showToast({ title: msg, icon: 'none' })
  })
}

function onSearchClear() {
  searchKeyword.value = ''
  verifyHistoryStore.fetchHistory().catch((err) => {
    const msg = err instanceof Error ? err.message : '历史记录加载失败'
    uni.showToast({ title: msg, icon: 'none' })
  })
}

function getVerifyResult(item: PayslipVerifyRecord): PayslipVerifyResult {
  return verifyResultMap.value.get(item.id)!
}

function fmt(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2)
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function confirmDelete(item: PayslipVerifyRecord) {
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
    <view class="p-24rpx">
      <wd-search
        v-model="searchInput"
        placeholder="搜索年月或税前金额"
        hide-cancel
        variant="light"
        custom-class="search mb-16rpx"
        @search="onSearch"
        @clear="onSearchClear"
      />

      <view v-if="list.length > 0" class="px-8rpx pb-16rpx">
        <text class="text-26rpx text-#999">
          {{ searchKeyword ? `找到 ${filteredList.length} 条` : `共 ${list.length} 条` }}
        </text>
      </view>

      <wd-empty
        v-if="list.length === 0"
        tip="暂无核对历史，在工资核对页点击「开始核对」会自动保存。"
      />

      <wd-empty
        v-else-if="searchKeyword && filteredList.length === 0"
        tip="未找到匹配的历史记录"
      />

      <template v-else>
        <view v-for="item in filteredList" :key="item.id" class="mb-20rpx">
          <wd-swipe-action>
            <view class="card-rounded p-28rpx">
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
                {{ formatTime(item.savedAt) }}
              </view>
            </view>
            <template #right>
              <view class="h-full flex">
                <view
                  class="history-swipe-del box-border h-full min-h-144rpx center px-40rpx"
                  @click.stop="confirmDelete(item)"
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
    </view>
  </view>
</template>

<style scoped lang="scss">
:deep(.search) {
  padding: 0 !important;
  background: none !important;
}

.history-swipe-del {
  background: #e2231a;
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
  background: #fffbe6;
  border: 2rpx solid #ffe58f;
}

.history-abnormal__text {
  font-size: 24rpx;
  color: #d48806;
  line-height: 1.55;
}
</style>

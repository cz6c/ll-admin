<script lang="ts" setup>
import { onShow } from '@dcloudio/uni-app'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'
import { usePageHeight } from '@/composables/usePageHeight'
import { useSalaryHistoryStore } from '@/store/salaryHistory'
import { useSalaryVerifyHistoryStore } from '@/store/salaryVerifyHistory'
import { parsePayPeriod } from '@/utils/payPeriod'
import { computeVerifyForRecord } from '@/utils/payslipVerify'

defineOptions({ name: 'SalaryHome' })

definePage({
  type: 'home',
  style: {
    navigationStyle: 'custom',
  },
})

const LAST_ENTRY_KEY = 'salary-home-last-entry'
const { tabBarHeight } = usePageHeight()

interface HomeFeature {
  key: string
  title: string
  desc: string
  cta: string
  url: string
  theme: 'blue' | 'green'
  icon: string
}

interface RecentEntry {
  id: string
  key: string
  title: string
  subtitle: string
  time: number
  theme: 'blue' | 'green'
  url: string
}

const features: HomeFeature[] = [
  {
    key: 'calc',
    title: '年薪测算',
    desc: '输入月薪，一键算出全年税后收入',
    cta: '开始计算',
    url: '/pages/salary/calc',
    theme: 'blue',
    icon: 'file',
  },
  {
    key: 'verify',
    title: '月薪核对',
    desc: '识别工资条，自动比对应发与扣款',
    cta: '开始核对',
    url: '/pages/salary/verify',
    theme: 'green',
    icon: 'check-square',
  },
]

const salaryHistoryStore = useSalaryHistoryStore()
const verifyHistoryStore = useSalaryVerifyHistoryStore()
const hasLoaded = ref(false)

const latestCalcSavedAt = computed(() => {
  return salaryHistoryStore.items.reduce((max, item) => Math.max(max, Number(item.savedAt ?? 0)), 0)
})

const latestVerifySavedAt = computed(() => {
  return verifyHistoryStore.items.reduce((max, item) => Math.max(max, Number(item.savedAt ?? 0)), 0)
})

const featureStats = computed(() => {
  return {
    calc: {
      latestDate: latestCalcSavedAt.value ? dayjs(latestCalcSavedAt.value).format('YYYY-MM-DD') : '',
      count: salaryHistoryStore.items.length,
    },
    verify: {
      latestDate: latestVerifySavedAt.value ? dayjs(latestVerifySavedAt.value).format('YYYY-MM-DD') : '',
      count: verifyHistoryStore.items.length,
    },
  }
})

const recentEntries = computed<RecentEntry[]>(() => {
  const calcEntries: RecentEntry[] = salaryHistoryStore.items.map(item => ({
    id: item.id,
    key: `calc-${item.id}`,
    title: `月薪 ¥${formatAmount(item.input.preTaxMonthly)} 算税结果`,
    subtitle: `年薪测算 · ${dayjs(item.savedAt).format('MM-DD')}`,
    time: Number(item.savedAt ?? 0),
    theme: 'blue',
    url: `/pages/salary/detail?id=${encodeURIComponent(item.id)}`,
  }))

  const verifyEntries: RecentEntry[] = verifyHistoryStore.items.map((item) => {
    const { month } = parsePayPeriod(item.payPeriod)
    const verify = computeVerifyForRecord(item, verifyHistoryStore.items)
    const diff = Math.max(Math.abs(verify.taxDiff), Math.abs(verify.postTaxDiff))
    const verifyText = verify.overallMatch ? '核对无误' : `差异 ¥${formatAmount(diff)}`
    return {
      id: item.id,
      key: `verify-${item.id}`,
      title: `${month} 月工资条核对 · ${verifyText}`,
      subtitle: `月薪核对 · ${dayjs(item.savedAt).format('MM-DD')}`,
      time: Number(item.savedAt ?? 0),
      theme: 'green',
      url: '/pages/salary/history?tab=verify',
    }
  })

  return [...calcEntries, ...verifyEntries]
    .sort((a, b) => b.time - a.time)
    .slice(0, 3)
})

function featureHint(featureKey: string) {
  const stats = featureStats.value[featureKey as keyof typeof featureStats.value]
  if (!stats || stats.count <= 0 || !stats.latestDate)
    return '首次使用 · 共 0 条记录'
  return `最近使用 · ${stats.latestDate} | 共 ${stats.count} 条记录`
}

function formatAmount(value: number) {
  const amount = Number(value || 0)
  const safeValue = Number.isFinite(amount) ? amount : 0
  return safeValue.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

onShow(async () => {
  try {
    await Promise.all([
      salaryHistoryStore.fetchHistory(),
      verifyHistoryStore.fetchHistory(),
    ])
  }
  catch {
    // 首页只做展示，不因历史同步失败中断入口操作
  }
  finally {
    hasLoaded.value = true
  }
})

function enterFeature(feature: HomeFeature) {
  uni.setStorageSync(LAST_ENTRY_KEY, feature.key)
  uni.navigateTo({ url: feature.url })
}

function enterRecent(entry: RecentEntry) {
  uni.navigateTo({ url: entry.url })
}

function openAllHistory() {
  uni.navigateTo({ url: '/pages/salary/history' })
}
</script>

<template>
  <view class="page-shell px-32rpx" :style="{ paddingTop: `${tabBarHeight}px` }">
    <view>
      <view class="text-52rpx text-#111827 font-600">
        薪算工具箱
      </view>
      <view class="mt-16rpx text-32rpx text-#4b5563">
        算得清楚，对得明白
      </view>
    </view>

    <view class="mt-32rpx">
      <view class="flex items-center gap-8rpx text-28rpx text-#9aa1ad">
        <wd-icon name="common" size="28rpx" />
        常用工具
      </view>

      <view class="mt-24rpx flex flex-col gap-24rpx">
        <view
          v-for="feature in features"
          :key="feature.key"
          class="card-rounded p-32rpx"
        >
          <view class="flex items-center gap-16rpx">
            <view
              class="h-88rpx w-88rpx flex items-center justify-center rounded-24rpx"
              :class="feature.theme === 'green' ? 'bg-#d1fae5' : 'bg-[var(--wot-primary-1)]'"
            >
              <wd-icon :name="feature.icon" size="24px" :color="feature.theme === 'green' ? 'var(--wot-success-main)' : 'var(--wot-primary-6)'" />
            </view>
            <view class="min-w-0 flex-1">
              <view class="text-32rpx text-#111827 font-600">
                {{ feature.title }}
              </view>
              <view class="mt-8rpx text-28rpx text-#4b5563">
                {{ feature.desc }}
              </view>
            </view>
          </view>

          <view class="mt-32rpx flex items-center justify-between gap-24rpx">
            <view class="min-w-0 flex-1 truncate text-24rpx text-#4b5563">
              {{ featureHint(feature.key) }}
            </view>
            <wd-button
              size="small"
              :type="feature.theme === 'green' ? 'success' : 'primary'"
              @click="enterFeature(feature)"
            >
              {{ feature.cta }}
            </wd-button>
          </view>
        </view>
      </view>
    </view>

    <view class="mt-32rpx">
      <view class="flex items-center justify-between">
        <view class="mt-0 flex items-center gap-8rpx text-28rpx text-#9aa1ad">
          <wd-icon name="history" size="28rpx" />
          最近记录
        </view>
        <view class="text-24rpx text-primary" @click="openAllHistory">
          查看全部
        </view>
      </view>

      <view v-if="recentEntries.length > 0" class="mt-24rpx card-rounded overflow-hidden">
        <view
          v-for="(entry, idx) in recentEntries"
          :key="entry.key"
          class="flex items-center justify-between gap-20rpx px-28rpx py-24rpx"
          :class="{ 'border-b border-#edf0f6': idx < recentEntries.length - 1 }"
          @click="enterRecent(entry)"
        >
          <view class="min-w-0 flex-1">
            <view class="truncate text-30rpx text-#111827">
              {{ entry.title }}
            </view>
            <view class="mt-10rpx flex items-center gap-10rpx">
              <view
                class="h-12rpx w-12rpx rounded-full"
                :class="entry.theme === 'green' ? 'bg-[var(--wot-success-main)]' : 'bg-primary'"
              />
              <view class="text-24rpx text-#6b7280">
                {{ entry.subtitle }}
              </view>
            </view>
          </view>
          <wd-icon name="arrow-right" size="28rpx" color="#a9afb8" />
        </view>
      </view>

      <view
        v-else
        class="recent-empty-wrap mt-24rpx"
      >
        <wd-icon name="empty" size="72rpx" color="#c7ccd6" />
        <view class="mt-20rpx text-28rpx text-#5f636c font-500">
          还没有使用记录
        </view>
        <view class="mt-12rpx text-24rpx text-#9aa1ad">
          完成第一次测算或核对后，这里会显示历史记录
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.recent-empty-wrap {
  min-height: 260rpx;
  background-color: #fbfcfd;
  border: 1rpx dashed #edf0f6;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40rpx 24rpx;
}
</style>

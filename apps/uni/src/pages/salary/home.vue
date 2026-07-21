<script lang="ts" setup>
/**
 * 薪算工具箱首页
 * 主流程：展示测算/核对入口 → onShow 同步两类历史 → 最近记录（最多 3 条）进详情
 */
import type { SalaryHistoryEntry } from '@/utils/salaryHistoryEntry'
import { onShow } from '@dcloudio/uni-app'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'
import SalaryHistoryEntryRow from '@/components/SalaryHistoryEntryRow.vue'
import { usePageHeight } from '@/composables/usePageHeight'
import { useSalaryHistoryStore } from '@/store/salaryHistory'
import { useSalaryVerifyHistoryStore } from '@/store/salaryVerifyHistory'
import { mergeSalaryHistoryEntries } from '@/utils/salaryHistoryEntry'

defineOptions({ name: 'SalaryHome' })

definePage({
  type: 'home',
  style: {
    'navigationStyle': 'custom',
    'navigationBarTitleText': '工具工作台',
    'mp-alipay': {
      defaultTitle: ' ',
      transparentTitle: 'always',
      titlePenetrate: 'YES',
    },
  },
})

/** 本地记录上次点击的功能入口 key（calc/verify） */
const LAST_ENTRY_KEY = 'salary-home-last-entry'
const { tabBarHeight } = usePageHeight()

/** 首页功能卡片配置 */
interface HomeFeature {
  key: string
  title: string
  desc: string
  cta: string
  url: string
  theme: 'blue' | 'green'
  icon: string
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
    desc: '识别工资条，自动核对应发与扣款',
    cta: '开始核对',
    url: '/pages/salary/verify',
    theme: 'green',
    icon: 'check-square',
  },
]

const salaryHistoryStore = useSalaryHistoryStore()
const verifyHistoryStore = useSalaryVerifyHistoryStore()
const hasLoaded = ref(false)

const latestCalcUpdateMs = computed(() => {
  return salaryHistoryStore.items.reduce((max, item) => Math.max(max, new Date(item.updateTime).getTime() || 0), 0)
})

const latestVerifyUpdateMs = computed(() => {
  return verifyHistoryStore.items.reduce((max, item) => Math.max(max, new Date(item.updateTime).getTime() || 0), 0)
})

const featureStats = computed(() => {
  return {
    calc: {
      latestDate: latestCalcUpdateMs.value ? dayjs(latestCalcUpdateMs.value).format('YYYY-MM-DD') : '',
      count: salaryHistoryStore.items.length,
    },
    verify: {
      latestDate: latestVerifyUpdateMs.value ? dayjs(latestVerifyUpdateMs.value).format('YYYY-MM-DD') : '',
      count: verifyHistoryStore.items.length,
    },
  }
})

const recentEntries = computed(() => {
  return mergeSalaryHistoryEntries(salaryHistoryStore.items, verifyHistoryStore.items).slice(0, 3)
})

function featureHint(featureKey: string) {
  const stats = featureStats.value[featureKey as keyof typeof featureStats.value]
  if (!stats || stats.count <= 0 || !stats.latestDate)
    return '首次使用 · 共 0 条记录'
  return `最近使用 · ${stats.latestDate} · 共 ${stats.count} 条记录`
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

function enterRecent(entry: SalaryHistoryEntry) {
  uni.navigateTo({ url: entry.url })
}

function openAllHistory() {
  uni.navigateTo({ url: '/pages/salary/history' })
}
</script>

<template>
  <view class="page-shell px-32rpx" :style="{ paddingTop: `${tabBarHeight}px` }">
    <view>
      <view class="text-52rpx font-600">
        薪算工具箱
      </view>
      <view class="mt-16rpx text-32rpx text-#666">
        算得清楚，对得明白
      </view>
    </view>

    <view class="mt-32rpx">
      <view class="flex items-center gap-8rpx text-28rpx text-#999">
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
              <view class="text-32rpx font-600">
                {{ feature.title }}
              </view>
              <view class="mt-8rpx text-28rpx text-#666">
                {{ feature.desc }}
              </view>
            </view>
          </view>

          <view class="mt-32rpx flex items-center justify-between gap-24rpx">
            <view class="min-w-0 flex-1 truncate text-24rpx text-#999">
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
        <view class="mt-0 flex items-center gap-8rpx text-28rpx text-#999">
          <wd-icon name="history" size="28rpx" />
          最近记录
        </view>
        <view class="text-24rpx text-primary" @click="openAllHistory">
          查看全部
        </view>
      </view>

      <view v-if="recentEntries.length > 0" class="mt-24rpx card-rounded overflow-hidden">
        <SalaryHistoryEntryRow
          v-for="(entry, idx) in recentEntries"
          :key="entry.key"
          :title="entry.title"
          :subtitle="entry.subtitle"
          :theme="entry.theme"
          :bordered="idx < recentEntries.length - 1"
          @click="enterRecent(entry)"
        />
      </view>

      <view
        v-else
        class="recent-empty-wrap mt-24rpx"
      >
        <wd-icon name="empty" size="72rpx" color="#999" />
        <view class="mt-20rpx text-28rpx text-#999 font-500">
          还没有使用记录
        </view>
        <view class="mt-12rpx text-24rpx text-#999">
          完成第一次测算或核对后，这里会显示历史记录
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.recent-empty-wrap {
  min-height: 280rpx;
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

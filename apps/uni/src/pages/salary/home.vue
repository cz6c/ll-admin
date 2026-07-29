<script lang="ts" setup>
/**
 * 聚鑫助手首页
 * 主流程：未同意协议则 redirect 门禁页 → 展示测算/核对入口 → 信任条 → onShow 同步历史
 */
import type { SalaryHistoryEntry } from '@/utils/salaryHistoryEntry'
import { onLoad, onShow } from '@dcloudio/uni-app'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'
import { getSalaryTrustStats } from '@/api/salary-verify'
import SalaryHistoryEntryRow from '@/components/SalaryHistoryEntryRow.vue'
import { usePageHeight } from '@/composables/usePageHeight'
import { hasPrivacyAgreed, PRIVACY_GATE_PATH } from '@/constants/privacy'
import { useSalaryHistoryStore } from '@/store/salaryHistory'
import { captureChannelFromQuery } from '@/utils/channelFrom'
import { mergeSalaryHistoryEntries } from '@/utils/salaryHistoryEntry'

defineOptions({ name: 'SalaryHome' })

definePage({
  type: 'home',
  style: {
    'navigationStyle': 'custom',
    'navigationBarTitleText': '智能个税测算与工资条识别',
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
    key: 'verify',
    title: '月薪核对',
    desc: '识别工资条，自动核对应发与扣款',
    cta: '开始核对',
    url: '/pages/salary/verify',
    theme: 'green',
    icon: 'check-square',
  },
  {
    key: 'calc',
    title: '年薪测算',
    desc: '输入月薪，一键算出全年税后收入',
    cta: '开始测算',
    url: '/pages/salary/calc',
    theme: 'blue',
    icon: 'file',
  },
]

const salaryHistoryStore = useSalaryHistoryStore()
const hasLoaded = ref(false)
/** 信任条是否有可展示数据 */
const trustVisible = ref(false)
/** 信任条目标值；挂载 wd-count-to 后自动滚动 */
const trustUsers = ref(0)
const trustVerify = ref(0)
const trustCalc = ref(0)
/** 本页生命周期内只赋一次目标值，避免 onShow 反复触发 count-to */
let trustLoaded = false

const latestCalcUpdateMs = computed(() => {
  return salaryHistoryStore.calcItems.reduce((max, item) => Math.max(max, new Date(item.updateTime).getTime() || 0), 0)
})

const latestVerifyUpdateMs = computed(() => {
  return salaryHistoryStore.verifyItems.reduce((max, item) => Math.max(max, new Date(item.updateTime).getTime() || 0), 0)
})

const featureStats = computed(() => {
  return {
    calc: {
      latestDate: latestCalcUpdateMs.value ? dayjs(latestCalcUpdateMs.value).format('YYYY-MM-DD') : '',
      count: salaryHistoryStore.calcItems.length,
    },
    verify: {
      latestDate: latestVerifyUpdateMs.value ? dayjs(latestVerifyUpdateMs.value).format('YYYY-MM-DD') : '',
      count: salaryHistoryStore.verifyItems.length,
    },
  }
})

const recentEntries = computed(() => {
  return mergeSalaryHistoryEntries(salaryHistoryStore.items).slice(0, 3)
})

function featureHint(featureKey: string) {
  const stats = featureStats.value[featureKey as keyof typeof featureStats.value]
  if (!stats || stats.count <= 0 || !stats.latestDate)
    return '首次使用 · 共 0 条记录'
  return `最近使用 · ${stats.latestDate} · 共 ${stats.count} 条记录`
}

async function loadTrustStats() {
  try {
    const stats = await getSalaryTrustStats()
    const users = Number(stats?.wechatUsers) || 0
    const verify = Number(stats?.verifyTimes) || 0
    const calc = Number(stats?.calcTimes) || 0
    if (users <= 0 && verify <= 0 && calc <= 0) {
      trustVisible.value = false
      return
    }
    if (!trustLoaded) {
      trustLoaded = true
      trustUsers.value = users
      trustVerify.value = verify
      trustCalc.value = calc
      // 先定值再显示，保证 wd-count-to 挂载时 endVal 已就绪
      trustVisible.value = true
    }
  }
  catch {
    // 信任条非主流程，失败则隐藏，不打断入口
    trustVisible.value = false
  }
}

onLoad((options?: Record<string, string>) => {
  captureChannelFromQuery(options)
})

onShow(async () => {
  // 未同意协议：redirect 到空白门禁页（页内弹窗），避免全局弹窗盖住协议正文
  if (!hasPrivacyAgreed()) {
    uni.redirectTo({ url: PRIVACY_GATE_PATH })
    return
  }
  try {
    await Promise.all([
      salaryHistoryStore.fetchHistory(),
      loadTrustStats(),
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
  <view class="page-shell">
    <view class="hero-card flex items-center justify-between gap-16rpx px-32rpx pb-32rpx" :style="{ paddingTop: `${tabBarHeight}px` }">
      <view class="min-w-0 flex-1">
        <view class="text-52rpx font-600">
          聚鑫助手
        </view>
        <view class="mt-24rpx text-32rpx">
          算得清楚，对得明白
        </view>
      </view>
      <view class="i-carbon-calculator hero-card__icon" />
    </view>

    <view class="mt-32rpx px-32rpx">
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

    <view class="mt-32rpx px-32rpx">
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

    <!-- 信任条：社会证明，失败/无数据时隐藏 -->
    <view v-if="trustVisible" class="trust-bar my-32rpx px-32rpx">
      <view class="trust-bar__item">
        <wd-count-to
          custom-class="trust-bar__num"
          type="primary"
          color="var(--wot-primary-6)"
          :start-val="0"
          :end-val="trustUsers"
          :duration="1100"
          separator=","
          suffix="+"
        />
        <text class="trust-bar__label">
          累计服务用户
        </text>
      </view>
      <view class="trust-bar__divider" />
      <view class="trust-bar__item">
        <wd-count-to
          custom-class="trust-bar__num"
          type="primary"
          color="var(--wot-primary-6)"
          :start-val="0"
          :end-val="trustVerify"
          :duration="1100"
          separator=","
          suffix="+"
        />
        <text class="trust-bar__label">
          累计完成核对
        </text>
      </view>
      <view class="trust-bar__divider" />
      <view class="trust-bar__item">
        <wd-count-to
          custom-class="trust-bar__num"
          type="primary"
          color="var(--wot-primary-6)"
          :start-val="0"
          :end-val="trustCalc"
          :duration="1100"
          separator=","
          suffix="+"
        />
        <text class="trust-bar__label">
          累计完成测算
        </text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.hero-card {
  background: var(--wot-primary-6);
  color: #fff;
}

.hero-card__icon {
  flex-shrink: 0;
  width: 168rpx;
  height: 168rpx;
  color: rgba(255, 255, 255, 0.22);
}

.trust-bar {
  display: flex;
  align-items: stretch;
}

.trust-bar__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  min-width: 0;
  padding: 0 12rpx;
}

.trust-bar__num {
  font-size: 32rpx;
  font-weight: 600;
  line-height: 1.2;
}

:deep(.trust-bar__num .wd-count-to__main-text),
:deep(.trust-bar__num .wd-count-to__separator-text) {
  font-size: 32rpx !important;
  font-weight: 600;
  line-height: 1.2;
}

.trust-bar__label {
  font-size: 22rpx;
  color: #999;
  text-align: center;
  line-height: 1.3;
}

.trust-bar__divider {
  width: 1rpx;
  align-self: stretch;
  margin: 8rpx 0;
  background: #e8ecf2;
}

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

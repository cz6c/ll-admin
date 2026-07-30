<script lang="ts" setup>
/**
 * 聚薪助手首页
 * 主流程：未同意协议则 redirect 门禁页 → 工具入口 → 最近记录
 */
import type { SalaryHistoryEntry } from '@/utils/salaryHistoryEntry'
import { onLoad, onShow } from '@dcloudio/uni-app'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'
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
  /** 拉新主路径：视觉加重 */
  primary?: boolean
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
    primary: true,
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

/**
 * 功能卡底部提示：有记录才展示；空态改短引导，避免与「最近记录」空态重复
 */
function featureHint(featureKey: string) {
  const stats = featureStats.value[featureKey as keyof typeof featureStats.value]
  if (!stats || stats.count <= 0 || !stats.latestDate) {
    return featureKey === 'verify' ? '拍工资条，30 秒看扣款对不对' : '谈薪前先算清全年到手'
  }
  return `最近 · ${stats.latestDate} · ${stats.count} 条`
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
    await salaryHistoryStore.fetchHistory()
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

function goVerify() {
  enterFeature(features[0])
}
</script>

<template>
  <view class="page-home page-shell pb-safe">
    <!-- Hero：渐变 + 底部圆角，托住下方内容区 -->
    <view
      class="hero-card flex items-end justify-between gap-16rpx px-32rpx pb-56rpx"
      :style="{ paddingTop: `${tabBarHeight + 12}px` }"
    >
      <view class="min-w-0 flex-1 pb-8rpx">
        <view class="text-52rpx text-white font-600 tracking-2rpx">
          聚薪助手
        </view>
        <view class="hero-card__slogan mt-16rpx text-28rpx">
          算得清楚，对得明白
        </view>
      </view>
      <view class="i-carbon-calculator hero-card__icon" />
    </view>

    <!-- 上叠内容：工具卡 → 最近；信任数据沉底（私密工具忌强社会证明） -->
    <view class="content-panel px-24rpx pb-32rpx">
      <!-- 首卡上叠 hero；标题放卡上方会压在蓝底上发虚，故去掉「工具」字 -->
      <view class="feature-stack flex flex-col gap-20rpx">
        <view
          v-for="feature in features"
          :key="feature.key"
          class="feature-card card-rounded p-32rpx"
          :class="feature.primary ? 'feature-card--primary' : 'feature-card--secondary'"
          hover-class="feature-card--pressed"
          :hover-stay-time="80"
          @click="enterFeature(feature)"
        >
          <view class="flex items-center gap-20rpx">
            <view
              class="feature-card__icon shrink-0"
              :class="feature.theme === 'green' ? 'feature-card__icon--green' : 'feature-card__icon--blue'"
            >
              <wd-icon
                :name="feature.icon"
                size="24px"
                :color="feature.theme === 'green' ? 'var(--wot-success-main)' : 'var(--wot-primary-6)'"
              />
            </view>
            <view class="min-w-0 flex-1">
              <view class="flex items-center gap-12rpx">
                <text class="text-32rpx text-#1f2329 font-600">
                  {{ feature.title }}
                </text>
                <text
                  v-if="feature.primary"
                  class="feature-card__badge"
                >
                  推荐
                </text>
              </view>
              <view class="mt-8rpx text-26rpx text-#666 leading-snug">
                {{ feature.desc }}
              </view>
            </view>
            <wd-icon name="right" size="32rpx" color="#c0c4cc" />
          </view>

          <view class="feature-card__footer mt-28rpx flex items-center justify-between gap-24rpx">
            <view class="min-w-0 flex-1 truncate text-24rpx text-#999">
              {{ featureHint(feature.key) }}
            </view>
            <view
              class="feature-card__cta"
              :class="feature.theme === 'green' ? 'feature-card__cta--green' : 'feature-card__cta--blue'"
            >
              {{ feature.cta }}
            </view>
          </view>
        </view>
      </view>

      <view class="mt-36rpx flex items-center justify-between">
        <view class="flex items-center gap-8rpx text-24rpx text-#999">
          <view class="i-carbon-time h-24rpx w-24rpx" />
          最近记录
        </view>
        <view
          class="text-24rpx text-primary"
          @click.stop="openAllHistory"
        >
          全部
        </view>
      </view>

      <view v-if="recentEntries.length > 0" class="home-list-card mt-20rpx card-rounded overflow-hidden">
        <SalaryHistoryEntryRow
          v-for="(entry, idx) in recentEntries"
          :key="entry.key"
          :title="entry.title"
          :subtitle="entry.subtitle"
          :theme="entry.theme"
          :icon="entry.theme === 'green' ? 'check-square' : 'file'"
          :bordered="idx < recentEntries.length - 1"
          @click="enterRecent(entry)"
        />
      </view>

      <view
        v-else
        class="recent-empty-wrap mt-20rpx"
      >
        <view class="text-28rpx text-#666 font-500">
          还没有记录
        </view>
        <view class="mt-8rpx text-24rpx text-#999">
          完成一次核对后会出现在这里
        </view>
        <view class="recent-empty-wrap__cta mt-24rpx" @click="goVerify">
          去核对工资条
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.page-home {
  min-height: 100vh;
  background: #f5f6f8;
}

.hero-card {
  /* 贴 logo：上亮下沉的品牌蓝；起点不用过浅，保证白字对比 */
  background: linear-gradient(
    168deg,
    var(--wot-primary-4) 0%,
    var(--wot-primary-6) 42%,
    var(--wot-primary-7) 78%,
    var(--wot-primary-8) 100%
  );
  border-radius: 0 0 40rpx 40rpx;
  color: #fff;
}

.hero-card__slogan {
  color: rgba(255, 255, 255, 0.78);
  font-weight: 400;
}

.hero-card__icon {
  flex-shrink: 0;
  width: 120rpx;
  height: 120rpx;
  margin-bottom: 4rpx;
  color: rgba(255, 255, 255, 0.28);
}

.content-panel {
  margin-top: -36rpx;
  position: relative;
  z-index: 1;
}

.feature-card {
  background: #fff;
  box-shadow: 0 4rpx 24rpx rgba(31, 35, 41, 0.04);
  transition: transform 0.12s ease;
}

.feature-card--primary {
  border: 2rpx solid var(--wot-success-particular, rgba(16, 185, 129, 0.28));
  background: linear-gradient(180deg, #fff 60%, var(--wot-success-surface, #ecfdf5) 100%);
}

.feature-card--secondary {
  border: 2rpx solid transparent;
}

.feature-card--pressed {
  transform: scale(0.985);
  opacity: 0.96;
}

.feature-card__icon {
  width: 88rpx;
  height: 88rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.feature-card__icon--green {
  background: var(--wot-success-surface, #ecfdf5);
}

.feature-card__icon--blue {
  background: var(--wot-primary-1);
}

.feature-card__badge {
  font-size: 20rpx;
  line-height: 1;
  padding: 6rpx 10rpx;
  border-radius: 8rpx;
  color: var(--wot-success-main);
  background: var(--wot-success-surface, #ecfdf5);
  font-weight: 500;
}

.feature-card__footer {
  padding-top: 24rpx;
  border-top: 1rpx solid #f0f2f5;
}

.feature-card__cta {
  flex-shrink: 0;
  font-size: 24rpx;
  font-weight: 600;
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
}

.feature-card__cta--green {
  color: var(--wot-success-main);
  background: var(--wot-success-surface, #ecfdf5);
}

.feature-card__cta--blue {
  color: var(--wot-primary-6);
  background: var(--wot-primary-1);
}

.home-list-card {
  background: #fff;
  box-shadow: 0 4rpx 24rpx rgba(31, 35, 41, 0.04);
}

.recent-empty-wrap {
  min-height: 220rpx;
  background-color: #fff;
  border: 1rpx dashed #e4e7ed;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36rpx 24rpx;
  box-shadow: 0 4rpx 24rpx rgba(31, 35, 41, 0.03);
}

.recent-empty-wrap__cta {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--wot-success-main);
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: var(--wot-success-surface, #ecfdf5);
}
</style>

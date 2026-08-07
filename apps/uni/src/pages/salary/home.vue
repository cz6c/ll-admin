<script lang="ts" setup>
/**
 * 薪算狮首页
 * 主流程：未同意协议则 redirect 门禁页 → 主次工具入口 → 本年核对进度
 */
import type { YearMonthCell } from '@/utils/salaryVerifyYearProgress'
import { onLoad, onShow } from '@dcloudio/uni-app'
import dayjs from 'dayjs'
import { computed } from 'vue'
import SalaryVerifyYearProgress from '@/components/salary/SalaryVerifyYearProgress.vue'
import { usePageHeight } from '@/composables/usePageHeight'
import { hasPrivacyAgreed, PRIVACY_GATE_PATH } from '@/constants/privacy'
import { useSalaryHistoryStore } from '@/store/salaryHistory'
import { captureChannelFromQuery } from '@/utils/channelFrom'
import { buildYearVerifyProgress } from '@/utils/salaryVerifyYearProgress'

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
    url: '/pages/salary/verify',
    theme: 'green',
    icon: 'check-square',
    primary: true,
  },
  {
    key: 'calc',
    title: '年薪测算',
    desc: '输入月薪，一键算出全年税后收入',
    url: '/pages/salary/calc',
    theme: 'blue',
    icon: 'file',
  },
]

const salaryHistoryStore = useSalaryHistoryStore()

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

/** 本年 1–12 月核对进度（截止上月，与核对页默认所属月一致） */
const yearProgress = computed(() => buildYearVerifyProgress(salaryHistoryStore.verifyItems))

/**
 * 功能卡底部一行状态：整卡唯一入口，不再放第二套 CTA
 * 核对有记录时只指下方进度，避免与进度摘要重复说「最近」
 */
function featureHint(featureKey: string) {
  const stats = featureStats.value[featureKey as keyof typeof featureStats.value]
  if (!stats || stats.count <= 0 || !stats.latestDate) {
    return featureKey === 'verify' ? '拍工资条，30 秒看扣款对不对' : '谈薪前先算清全年到手'
  }
  if (featureKey === 'verify')
    return '见下方进度'
  return `${stats.count} 次测算 · ${stats.latestDate}`
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
})

function enterFeature(feature: HomeFeature) {
  uni.setStorageSync(LAST_ENTRY_KEY, feature.key)
  uni.navigateTo({ url: feature.url })
}

function openAllHistory() {
  uni.navigateTo({ url: '/pages/salary/history' })
}

function openVerifyHistory() {
  uni.navigateTo({ url: '/pages/salary/history?tab=verify' })
}

function goVerifyWithPeriod(payPeriod?: string) {
  uni.setStorageSync(LAST_ENTRY_KEY, 'verify')
  const query = payPeriod ? `?payPeriod=${encodeURIComponent(payPeriod)}` : ''
  uni.navigateTo({ url: `/pages/salary/verify${query}` })
}

function onProgressCta() {
  const progress = yearProgress.value
  if (progress.ctaMode === 'history') {
    openVerifyHistory()
    return
  }
  goVerifyWithPeriod(progress.ctaPayPeriod)
}

/**
 * 月格点击：已核进详情；缺月进核对并带所属月
 * 未来月由子组件拦截，不进入此回调
 */
function onMonthClick(cell: YearMonthCell) {
  if (cell.status === 'future')
    return
  if ((cell.status === 'matched' || cell.status === 'mismatched') && cell.recordId) {
    uni.navigateTo({
      url: `/pages/salary/verify-detail?id=${encodeURIComponent(cell.recordId)}`,
    })
    return
  }
  goVerifyWithPeriod(cell.payPeriod)
}
</script>

<template>
  <view class="page-shell pb-safe">
    <!-- Hero：渐变 + 底部圆角，托住下方内容区 -->
    <view
      class="hero-card flex items-center gap-16rpx px-32rpx pb-64rpx"
      :style="{ paddingTop: `${tabBarHeight}px` }"
    >
      <view class="min-w-0 flex-1">
        <view class="hero-card__brand">
          薪算狮
        </view>
        <view class="hero-card__slogan">
          算得清楚，对得明白
        </view>
      </view>
    </view>

    <!-- 上叠内容：主次工具卡 → 本年核对进度（轻材质状态面板） -->
    <view class="content-panel px-24rpx pb-32rpx">
      <view class="feature-stack flex flex-col gap-16rpx">
        <view
          v-for="feature in features"
          :key="feature.key"
          class="feature-card card-rounded"
          :class="feature.primary ? 'feature-card--primary' : 'feature-card--secondary'"
          hover-class="feature-card--pressed"
          :hover-stay-time="70"
          @click="enterFeature(feature)"
        >
          <view class="feature-card__main flex items-center gap-20rpx">
            <view
              class="feature-card__icon shrink-0"
              :class="feature.theme === 'green' ? 'feature-card__icon--green' : 'feature-card__icon--blue'"
            >
              <wd-icon
                :name="feature.icon"
                :size="feature.primary ? '26px' : '22px'"
                :color="feature.theme === 'green' ? 'var(--wot-success-main)' : 'var(--wot-primary-6)'"
              />
            </view>
            <view class="min-w-0 flex-1">
              <view class="flex items-center gap-12rpx">
                <text
                  class="feature-card__title"
                  :class="feature.primary ? 'feature-card__title--primary' : 'feature-card__title--secondary'"
                >
                  {{ feature.title }}
                </text>
                <text
                  v-if="feature.primary"
                  class="feature-card__badge"
                >
                  推荐
                </text>
              </view>
              <view
                class="feature-card__desc"
                :class="feature.primary ? 'feature-card__desc--primary' : 'feature-card__desc--secondary'"
              >
                {{ feature.desc }}
              </view>
            </view>
          </view>

          <!-- 仅状态文案：整卡单击进入，不再放箭头/胶囊第二入口 -->
          <view class="feature-card__hint">
            {{ featureHint(feature.key) }}
          </view>
        </view>
      </view>

      <SalaryVerifyYearProgress
        :progress="yearProgress"
        @open-history="openAllHistory"
        @cta="onProgressCta"
        @month-click="onMonthClick"
      />
    </view>
  </view>
</template>

<style scoped lang="scss">
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

/* 大号品牌字负 tracking；口号略松 leading，字距近 0（小字忌再收紧） */
.hero-card__brand {
  font-size: 48rpx;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: #fff;
}

.hero-card__slogan {
  margin-top: 10rpx;
  font-size: 28rpx;
  font-weight: 400;
  letter-spacing: 0.01em;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.78);
}

.content-panel {
  margin-top: -36rpx;
  position: relative;
  z-index: 1;
}

.feature-card {
  /* 按压反馈 120ms + 强 ease-out；松手同曲线可中断 */
  transition:
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 120ms cubic-bezier(0.23, 1, 0.32, 1);
}

/* 主路径：更大触控面 + 更重材质；用色边区分，不用卡内发丝分割线 */
.feature-card--primary {
  padding: 36rpx 32rpx 28rpx;
  border: 2rpx solid var(--wot-success-particular, rgba(16, 185, 129, 0.28));
  background: linear-gradient(180deg, #fff 55%, var(--wot-success-surface, #ecfdf5) 100%);
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.1);
}

/* 次路径：无描边，仅靠间距与字重分层，减少仪表盘感 */
.feature-card--secondary {
  padding: 24rpx 28rpx 20rpx;
  border: none;
  background: #fff;
  box-shadow: 0 2rpx 12rpx rgba(31, 35, 41, 0.03);
}

.feature-card--pressed {
  transform: scale(0.97);
  opacity: 0.96;
}

.feature-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 24rpx;
}

.feature-card--primary .feature-card__icon {
  width: 96rpx;
  height: 96rpx;
}

.feature-card--secondary .feature-card__icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
}

.feature-card__icon--green {
  background: var(--wot-success-surface, #ecfdf5);
}

.feature-card__icon--blue {
  background: var(--wot-primary-1);
}

.feature-card__title--primary {
  font-size: 34rpx;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: #1f2329;
}

.feature-card__title--secondary {
  font-size: 30rpx;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: #1f2329;
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

.feature-card__desc--primary {
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #666;
  line-height: 1.4;
}

.feature-card__desc--secondary {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #8a9199;
  line-height: 1.35;
}

/* 状态行：用字重/间距与正文分层，不用 border-top */
.feature-card__hint {
  margin-top: 22rpx;
  font-size: 22rpx;
  font-weight: 400;
  letter-spacing: 0.01em;
  color: #8a9199;
  line-height: 1.35;
}

.feature-card--secondary .feature-card__hint {
  margin-top: 16rpx;
}
</style>

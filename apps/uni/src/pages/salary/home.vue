<script lang="ts" setup>
/**
 * 薪算狮首页
 * 主流程：未同意协议则 redirect 门禁页 → 月薪核对（入口+年进度）→ 底部个税知识点轮播（点按弹详情）
 */
import type { SalaryKnowledgeTip } from '@/constants/salaryKnowledgeTips'
import type { YearMonthCell } from '@/utils/salaryVerifyYearProgress'
import { onLoad, onShow } from '@dcloudio/uni-app'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'
import SalaryVerifyYearProgress from '@/components/salary/SalaryVerifyYearProgress.vue'
import { usePageHeight } from '@/composables/usePageHeight'
import { hasPrivacyAgreed, PRIVACY_GATE_PATH } from '@/constants/privacy'
import { SALARY_KNOWLEDGE_TIPS } from '@/constants/salaryKnowledgeTips'
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

/** 本地记录上次进入月薪核对 */
const LAST_ENTRY_KEY = 'salary-home-last-entry'
const { tabBarHeight } = usePageHeight()
const popupZIndex = 1100

const verifyFeature = {
  key: 'verify',
  title: '月薪核对',
  desc: '识别工资条，自动核对应发与扣款',
  url: '/pages/salary/verify',
  icon: 'check-square',
} as const

const salaryHistoryStore = useSalaryHistoryStore()

const latestVerifyUpdateMs = computed(() => {
  return salaryHistoryStore.verifyItems.reduce((max, item) => Math.max(max, new Date(item.updateTime).getTime() || 0), 0)
})

const verifyStats = computed(() => {
  const latestDate = latestVerifyUpdateMs.value ? dayjs(latestVerifyUpdateMs.value).format('YYYY-MM-DD') : ''
  return {
    latestDate,
    count: salaryHistoryStore.verifyItems.length,
  }
})

/** 本年 1–12 月核对进度（截止上月，与核对页默认所属月一致） */
const yearProgress = computed(() => buildYearVerifyProgress(salaryHistoryStore.verifyItems))

const knowledgeTips = SALARY_KNOWLEDGE_TIPS
const knowledgeSwiperCurrent = ref(0)
const showKnowledgeDetail = ref(false)
const activeKnowledge = ref<SalaryKnowledgeTip | null>(null)

/** 详情打开时暂停自动轮播，避免关闭弹层后当前页与刚读内容不一致 */
const knowledgeSwiperAutoplay = computed(() => !showKnowledgeDetail.value)

/** 核对卡底部状态行 */
function verifyHint() {
  const stats = verifyStats.value
  if (stats.count <= 0 || !stats.latestDate)
    return '拍工资条，30 秒看扣款对不对'
  return '见下方进度'
}

/**
 * 打开知识点详情弹层
 * @note 先对齐当前滑块索引并关 autoplay，避免阅毕关闭时对不上卡片
 */
function openKnowledgeTip(tip: SalaryKnowledgeTip) {
  const index = knowledgeTips.findIndex(t => t.id === tip.id)
  if (index >= 0)
    knowledgeSwiperCurrent.value = index
  activeKnowledge.value = tip
  showKnowledgeDetail.value = true
}

function knowledgeDetailTitle(tip: SalaryKnowledgeTip) {
  return tip.detailTitle || tip.title
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

function enterVerify() {
  uni.setStorageSync(LAST_ENTRY_KEY, verifyFeature.key)
  uni.navigateTo({ url: verifyFeature.url })
}

/** 进度头「对照表」：本年累计对照（与个税 App 逐月对） */
function openVerifyYearLedger() {
  const y = yearProgress.value.year
  uni.navigateTo({ url: `/pages/salary/verifyYear?year=${y}` })
}

function goVerifyWithPeriod(payPeriod?: string) {
  uni.setStorageSync(LAST_ENTRY_KEY, 'verify')
  const query = payPeriod ? `?payPeriod=${encodeURIComponent(payPeriod)}` : ''
  uni.navigateTo({ url: `/pages/salary/verify${query}` })
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

    <view class="content-panel px-24rpx pb-32rpx">
      <view class="verify-group">
        <view
          class="feature-card feature-card--primary card-rounded"
          hover-class="feature-card--pressed"
          :hover-stay-time="70"
          @click="enterVerify"
        >
          <view class="feature-card__main flex items-center gap-20rpx">
            <view class="feature-card__icon feature-card__icon--green shrink-0">
              <wd-icon
                :name="verifyFeature.icon"
                size="26px"
                color="var(--wot-success-main)"
              />
            </view>
            <view class="min-w-0 flex-1">
              <view class="flex items-center gap-12rpx">
                <text class="feature-card__title feature-card__title--primary">
                  {{ verifyFeature.title }}
                </text>
                <text class="feature-card__badge">
                  推荐
                </text>
              </view>
              <view class="feature-card__desc feature-card__desc--primary">
                {{ verifyFeature.desc }}
              </view>
            </view>
          </view>
          <view class="feature-card__hint">
            {{ verifyHint() }}
          </view>
        </view>

        <SalaryVerifyYearProgress
          :progress="yearProgress"
          @open-ledger="openVerifyYearLedger"
          @month-click="onMonthClick"
        />
      </view>

      <view class="knowledge-section mt-32rpx">
        <view class="knowledge-section__head flex items-center justify-between px-8rpx">
          <text class="knowledge-section__title">
            个税小知识
          </text>
        </view>
        <wd-swiper
          v-model:current="knowledgeSwiperCurrent"
          :list="knowledgeTips"
          :autoplay="knowledgeSwiperAutoplay"
          :height="118"
          :interval="6000"
          :radius="16"
          indicator
          indicator-position="bottom"
          custom-class="knowledge-swiper"
        >
          <template #default="{ item }">
            <view
              class="knowledge-card card-rounded"
              hover-class="knowledge-card--pressed"
              :hover-stay-time="60"
              @click="openKnowledgeTip(item as SalaryKnowledgeTip)"
            >
              <text class="knowledge-card__title">
                {{ (item as SalaryKnowledgeTip).title }}
              </text>
              <text class="knowledge-card__summary">
                {{ (item as SalaryKnowledgeTip).summary }}
              </text>
            </view>
          </template>
        </wd-swiper>
        <text class="knowledge-section__disclaimer">
          内容仅供参考，具体以税务机关解释为准
        </text>
      </view>
    </view>

    <wd-popup
      v-model="showKnowledgeDetail"
      position="bottom"
      :z-index="popupZIndex"
      root-portal
      :safe-area-inset-bottom="true"
      closable
      lock-scroll
    >
      <view
        v-if="activeKnowledge"
        class="knowledge-detail-sheet max-h-75vh flex flex-col rounded-t-24rpx bg-white"
      >
        <view class="shrink-0 border-b border-#edf0f6 p-32rpx text-center text-32rpx text-#333 font-600">
          {{ knowledgeDetailTitle(activeKnowledge) }}
        </view>
        <scroll-view scroll-y class="knowledge-detail-sheet__scroll" :show-scrollbar="true">
          <view class="px-32rpx py-24rpx pb-48rpx">
            <text
              v-for="(para, idx) in activeKnowledge.paragraphs"
              :key="idx"
              class="knowledge-detail__para"
              :class="{ 'knowledge-detail__para--gap': idx > 0 }"
            >
              {{ para }}
            </text>
          </view>
        </scroll-view>
      </view>
    </wd-popup>
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

/* 核对入口与进度同组 */
.verify-group {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.feature-card {
  /* 按压反馈 120ms + 强 ease-out；松手同曲线可中断 */
  transition:
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 120ms cubic-bezier(0.23, 1, 0.32, 1);
}

/* 主路径：更大触控面 + 更重材质；用色边区分 */
.feature-card--primary {
  padding: 36rpx 32rpx 28rpx;
  border: 2rpx solid var(--wot-success-particular, rgba(16, 185, 129, 0.28));
  background: linear-gradient(180deg, #fff 55%, var(--wot-success-surface, #ecfdf5) 100%);
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.1);
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

.feature-card__icon--green {
  background: var(--wot-success-surface, #ecfdf5);
}

.feature-card__title--primary {
  font-size: 34rpx;
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

.feature-card__hint {
  margin-top: 22rpx;
  font-size: 22rpx;
  font-weight: 400;
  letter-spacing: 0.01em;
  color: #8a9199;
  line-height: 1.35;
}

.knowledge-section__head {
  margin-bottom: 16rpx;
}

.knowledge-section__title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2329;
  line-height: 1.3;
}

.knowledge-section__action {
  font-size: 22rpx;
  color: #8a9199;
}

.knowledge-section__disclaimer {
  display: block;
  margin-top: 16rpx;
  padding: 0 8rpx;
  font-size: 20rpx;
  color: #b0b4bb;
  line-height: 1.4;
  text-align: center;
}

:deep(.knowledge-swiper .wd-swiper__item) {
  padding: 0 4rpx;
  box-sizing: border-box;
}

.knowledge-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  padding: 28rpx 32rpx;
  box-sizing: border-box;
  background: linear-gradient(135deg, #fff 0%, var(--wot-primary-1) 100%);
  border: 1rpx solid rgba(22, 136, 255, 0.12);
  box-shadow: 0 4rpx 20rpx rgba(31, 35, 41, 0.04);
  transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}

.knowledge-card--pressed {
  transform: scale(0.98);
}

.knowledge-card__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2329;
  line-height: 1.35;
}

.knowledge-card__summary {
  margin-top: 24rpx;
  font-size: 24rpx;
  color: #5c6370;
  line-height: 1.5;
}

.knowledge-detail-sheet__scroll {
  max-height: calc(75vh - 112rpx);
}

.knowledge-detail__para {
  display: block;
  font-size: 26rpx;
  color: #555;
  line-height: 1.65;
}

.knowledge-detail__para--gap {
  margin-top: 20rpx;
}
</style>

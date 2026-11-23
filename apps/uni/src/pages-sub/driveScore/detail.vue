<script lang="ts" setup>
/**
 * 试驾体验打分详情（只读）
 * 顶部雷达图展示六维；下方总分/分类小计与锚点文案；可跳转编辑
 * 图表：短延时再挂载 qiun-data-charts，避开转场量尺寸错位（同薪资明细）
 */
import type { DriveScoreRecord } from '@/api/driveScore'
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { getDriveScoreDetail } from '@/api/driveScore'
import {
  COMFORT_DIMENSIONS,
  DRIVE_SCORE_CATEGORY_LABEL,
  DRIVE_SCORE_DIMENSIONS,
  HARDWARE_DIMENSIONS,
  getDriveScoreAnchorHint,
} from '@/constants/driveScoreDimensions'

defineOptions({ name: 'DriveScoreDetail' })

definePage({
  style: {
    navigationBarTitleText: '打分详情',
  },
})

const recordId = ref(0)
const detail = ref<DriveScoreRecord | null>(null)
const loading = ref(false)

/** 转场结束后再挂图表，避免 canvas2d 按错误高度初始化 */
const chartReady = ref(false)
const chartMountKey = ref(0)
const CHART_MOUNT_DELAY_MS = 80
let chartMountTimer: ReturnType<typeof setTimeout> | null = null

function clearChartMountTimer() {
  if (chartMountTimer == null)
    return
  clearTimeout(chartMountTimer)
  chartMountTimer = null
}

function scheduleChartMount() {
  chartReady.value = false
  clearChartMountTimer()
  chartMountTimer = setTimeout(() => {
    chartMountTimer = null
    chartMountKey.value += 1
    chartReady.value = true
  }, CHART_MOUNT_DELAY_MS)
}

async function loadDetail() {
  if (!recordId.value)
    return
  loading.value = true
  chartReady.value = false
  try {
    detail.value = await getDriveScoreDetail(recordId.value)
    scheduleChartMount()
  }
  catch {
    detail.value = null
    // 业务/网络错误已由 http 层 toast
  }
  finally {
    loading.value = false
  }
}

onLoad((options?: Record<string, string>) => {
  const id = Number(options?.id)
  if (Number.isInteger(id) && id > 0)
    recordId.value = id
})

onShow(() => {
  loadDetail()
})

onHide(() => {
  clearChartMountTimer()
  chartReady.value = false
})

onUnload(() => {
  clearChartMountTimer()
})

function openEdit() {
  if (!recordId.value)
    return
  uni.navigateTo({ url: `/pages-sub/driveScore/edit?id=${recordId.value}` })
}

const hardwareDims = HARDWARE_DIMENSIONS
const comfortDims = COMFORT_DIMENSIONS

function scoreOf(key: keyof DriveScoreRecord) {
  return Number(detail.value?.[key] || 0)
}

/** 雷达图：六维顺序与常量表一致 */
const radarChartData = computed(() => {
  if (!detail.value) {
    return { categories: [] as string[], series: [] as { name: string, data: number[] }[] }
  }
  return {
    categories: DRIVE_SCORE_DIMENSIONS.map(item => item.title),
    series: [
      {
        name: '得分',
        data: DRIVE_SCORE_DIMENSIONS.map(item => scoreOf(item.scoreKey)),
      },
    ],
  }
})

const radarOpts = {
  color: ['#1688ff'],
  padding: [0, 8, 0, 8],
  dataLabel: false,
  legend: {
    show: false,
  },
  extra: {
    radar: {
      gridType: 'radar',
      gridCount: 5,
      max: 5,
      opacity: 0.25,
      border: true,
      borderWidth: 2,
      labelShow: true,
    },
  },
}
</script>

<template>
  <view class="page-shell">
    <view v-if="detail" class="summary card">
      <text class="vehicle-name">{{ detail.vehicleName }}</text>
      <text v-if="detail.remark" class="remark">{{ detail.remark }}</text>

      <view class="radar-box">
        <qiun-data-charts
          v-if="chartReady"
          :key="chartMountKey"
          type="radar"
          :opts="radarOpts"
          :chart-data="radarChartData"
          :canvas2d="true"
          background="none"
        />
        <view v-else class="radar-skeleton" />
      </view>

      <view class="score-row">
        <view class="score-block">
          <text class="score-num">{{ detail.totalScore }}</text>
          <text class="score-label">总分</text>
        </view>
        <view class="score-block">
          <text class="score-num is-sub">{{ detail.hardwareScore }}</text>
          <text class="score-label">硬件</text>
        </view>
        <view class="score-block">
          <text class="score-num is-sub">{{ detail.comfortScore }}</text>
          <text class="score-label">舒适</text>
        </view>
      </view>
    </view>

    <view v-if="detail" class="card">
      <text class="card-title">{{ DRIVE_SCORE_CATEGORY_LABEL.hardware }}</text>
      <view v-for="dim in hardwareDims" :key="dim.code" class="dim-row">
        <view class="dim-head">
          <text class="dim-title">{{ dim.title }}</text>
          <text class="dim-score">{{ scoreOf(dim.scoreKey) }}</text>
        </view>
        <text class="dim-hint">{{ getDriveScoreAnchorHint(dim, scoreOf(dim.scoreKey)) }}</text>
      </view>
    </view>

    <view v-if="detail" class="card">
      <text class="card-title">{{ DRIVE_SCORE_CATEGORY_LABEL.comfort }}</text>
      <view v-for="dim in comfortDims" :key="dim.code" class="dim-row">
        <view class="dim-head">
          <text class="dim-title">{{ dim.title }}</text>
          <text class="dim-score">{{ scoreOf(dim.scoreKey) }}</text>
        </view>
        <text class="dim-hint">{{ getDriveScoreAnchorHint(dim, scoreOf(dim.scoreKey)) }}</text>
      </view>
    </view>

    <view class="footer-safe">
      <wd-button block type="primary" @click="openEdit">
        编辑
      </wd-button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.page-shell {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx 24rpx calc(160rpx + env(safe-area-inset-bottom));
}

.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.vehicle-name {
  display: block;
  font-size: 36rpx;
  font-weight: 600;
  color: #1d2129;
}

.remark {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #8a9199;
  line-height: 1.5;
}

.radar-box {
  width: 100%;
  height: 480rpx;
  margin-top: 16rpx;
}

.radar-skeleton {
  width: 100%;
  height: 100%;
  border-radius: 16rpx;
  background: linear-gradient(90deg, #f2f3f5 25%, #e8e9eb 37%, #f2f3f5 63%);
  background-size: 400% 100%;
}

.score-row {
  display: flex;
  margin-top: 12rpx;
}

.score-block {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.score-num {
  font-size: 48rpx;
  font-weight: 600;
  color: var(--wot-primary-6, #1688ff);
  line-height: 1.2;
}

.score-num.is-sub {
  font-size: 40rpx;
  color: #1d2129;
}

.score-label {
  margin-top: 4rpx;
  font-size: 24rpx;
  color: #8a9199;
}

.card-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 8rpx;
}

.dim-row + .dim-row {
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #f0f0f0;
}

.dim-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dim-title {
  font-size: 30rpx;
  color: #1d2129;
}

.dim-score {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--wot-primary-6, #1688ff);
}

.dim-hint {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #8a9199;
  line-height: 1.5;
}

.footer-safe {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 32rpx calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.04);
}
</style>

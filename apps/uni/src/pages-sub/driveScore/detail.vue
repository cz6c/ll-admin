<script lang="ts" setup>
/**
 * 试驾体验打分详情（只读）
 * 顶部雷达图展示六维，中心叠放总分；下方各维锚点文案；可跳转编辑
 * 图表：短延时再挂载 qiun-data-charts，避开转场量尺寸错位（同薪资明细）
 */
import type { DriveScoreRecord } from '@/api/driveScore'
import type { DriveScoreScoreKey } from '@/constants/driveScoreDimensions'
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { getDriveScoreDetail } from '@/api/driveScore'
import {
  DRIVE_SCORE_DIMENSIONS,
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

function scoreOf(key: DriveScoreScoreKey) {
  return Number(detail.value?.[key] || 0)
}

/** 轴上分数展示：整星无小数，半分保留一位 */
function formatRadarAxisScore(score: number) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

/**
 * 雷达图 categories[i] 与 series[0].data[i] 必须同序同下标，顶点与类目才一致
 * 外圈：分数+短标题；顶点 dataLabel 再次标分，与下方分项同源字段
 */
const radarChartData = computed(() => {
  if (!detail.value) {
    return { categories: [] as string[], series: [] as { name: string, data: number[] }[] }
  }
  const data = DRIVE_SCORE_DIMENSIONS.map(dim => scoreOf(dim.scoreKey))
  const categories = DRIVE_SCORE_DIMENSIONS.map((dim, i) => {
    const s = formatRadarAxisScore(data[i])
    return `${dim.shortTitle}：${s}`
  })
  return {
    categories,
    series: [
      {
        name: '得分',
        data,
      },
    ],
  }
})

/** 编辑回流后强制图表随明细分数重绘 */
const radarChartKey = computed(() => {
  if (!detail.value)
    return `empty-${chartMountKey.value}`
  const sig = DRIVE_SCORE_DIMENSIONS.map(dim => scoreOf(dim.scoreKey)).join(',')
  return `${chartMountKey.value}-${sig}-${detail.value.updateTime || ''}`
})

const radarOpts = {
  color: ['#1688ff'],
  padding: [0, 0, 0, 0],
  fontSize: 13,
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
      labelColor: '#8a9199',
    },
    tooltip: {
      showBox: false,
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
          :key="radarChartKey"
          type="radar"
          :opts="radarOpts"
          :chart-data="radarChartData"
          :canvas2d="true"
          background="none"
        />
        <view v-else class="radar-skeleton" />
        <view v-if="chartReady" class="radar-center-score">
          <text class="radar-center-score__num tabular-nums">{{ detail.totalScore }}</text>
        </view>
      </view>
    </view>

    <view v-if="detail" class="card">
      <text class="card-title">分项得分</text>
      <view v-for="dim in DRIVE_SCORE_DIMENSIONS" :key="dim.code" class="dim-row">
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
  position: relative;
  width: 100%;
  height: 480rpx;
  margin-top: 16rpx;
}

.radar-center-score {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.radar-center-score__num {
  font-size: 56rpx;
  font-weight: 600;
  color: var(--wot-primary-6, #1688ff);
  line-height: 1.15;
}

.radar-skeleton {
  width: 100%;
  height: 100%;
  border-radius: 16rpx;
  background: linear-gradient(90deg, #f2f3f5 25%, #e8e9eb 37%, #f2f3f5 63%);
  background-size: 400% 100%;
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

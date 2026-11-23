<script lang="ts" setup>
/**
 * 试驾体验打分编辑页（新建 / 编辑共用）
 * 六维均已选 0.5-5（半分步进）且车辆名称非空后才可提交
 */
import type { DriveScorePayload } from '@/api/driveScore'
import type { DriveScoreDimension, DriveScoreScoreKey } from '@/constants/driveScoreDimensions'
import { onLoad } from '@dcloudio/uni-app'
import { computed, reactive, ref } from 'vue'
import { createDriveScore, getDriveScoreDetail, updateDriveScore } from '@/api/driveScore'
import {
  COMFORT_DIMENSIONS,
  DRIVE_SCORE_CATEGORY_LABEL,
  DRIVE_SCORE_DIMENSIONS,
  getDriveScoreAnchorHint,
  HARDWARE_DIMENSIONS,
} from '@/constants/driveScoreDimensions'

defineOptions({ name: 'DriveScoreEdit' })

definePage({
  style: {
    navigationBarTitleText: '新建打分',
  },
})

const recordId = ref<number | null>(null)
const submitting = ref(false)
const loading = ref(false)

const form = reactive({
  vehicleName: '',
  remark: '',
  scoreChassisSolidity: 0,
  scoreHandling: 0,
  scoreHighSpeedStability: 0,
  scoreQuietness: 0,
  scoreSeatingVisibility: 0,
  scoreBlindOperation: 0,
})

const expandedCodes = ref<string[]>([])

const isEdit = computed(() => recordId.value != null)

const canSubmit = computed(() => {
  if (!form.vehicleName.trim())
    return false
  return DRIVE_SCORE_DIMENSIONS.every((item) => {
    const score = Number(form[item.scoreKey])
    if (!(score >= 0.5 && score <= 5))
      return false
    // 与服务端 IsHalfStepScore 一致：仅允许 0.5 步进
    return Math.abs(score * 2 - Math.round(score * 2)) < 1e-8
  })
})

function scoreOf(key: DriveScoreScoreKey) {
  return form[key] || 0
}

function onRateChange(key: DriveScoreScoreKey, value: number | { value?: number }) {
  const score = typeof value === 'number' ? value : Number(value?.value || 0)
  form[key] = score
}

function toggleGuide(code: string) {
  if (expandedCodes.value.includes(code))
    expandedCodes.value = expandedCodes.value.filter(item => item !== code)
  else
    expandedCodes.value = [...expandedCodes.value, code]
}

function buildPayload(): DriveScorePayload {
  return {
    vehicleName: form.vehicleName.trim(),
    remark: form.remark.trim() || null,
    scoreChassisSolidity: form.scoreChassisSolidity,
    scoreHandling: form.scoreHandling,
    scoreHighSpeedStability: form.scoreHighSpeedStability,
    scoreQuietness: form.scoreQuietness,
    scoreSeatingVisibility: form.scoreSeatingVisibility,
    scoreBlindOperation: form.scoreBlindOperation,
  }
}

async function loadDetail(id: number) {
  loading.value = true
  try {
    const detail = await getDriveScoreDetail(id)
    recordId.value = detail.driveScoreId
    form.vehicleName = detail.vehicleName
    form.remark = detail.remark || ''
    form.scoreChassisSolidity = detail.scoreChassisSolidity
    form.scoreHandling = detail.scoreHandling
    form.scoreHighSpeedStability = detail.scoreHighSpeedStability
    form.scoreQuietness = detail.scoreQuietness
    form.scoreSeatingVisibility = detail.scoreSeatingVisibility
    form.scoreBlindOperation = detail.scoreBlindOperation
    uni.setNavigationBarTitle({ title: '编辑打分' })
  }
  catch {
    // 业务/网络错误已由 http 层 toast
  }
  finally {
    loading.value = false
  }
}

onLoad((options?: Record<string, string>) => {
  const id = Number(options?.id)
  if (Number.isInteger(id) && id > 0)
    loadDetail(id)
})

async function onSubmit() {
  if (!canSubmit.value || submitting.value)
    return
  submitting.value = true
  try {
    if (recordId.value) {
      await updateDriveScore({ ...buildPayload(), driveScoreId: recordId.value })
    }
    else {
      await createDriveScore(buildPayload())
    }
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => {
      uni.navigateBack()
    }, 400)
  }
  catch {
    // 业务/网络错误已由 http 层 toast
  }
  finally {
    submitting.value = false
  }
}

const hardwareDims = HARDWARE_DIMENSIONS
const comfortDims = COMFORT_DIMENSIONS

function guideOpen(dim: DriveScoreDimension) {
  return expandedCodes.value.includes(dim.code)
}
</script>

<template>
  <view class="page-shell">
    <view class="card">
      <text class="card-title">车辆信息</text>
      <wd-input
        v-model="form.vehicleName"
        label="车辆名称"
        placeholder="如：车型或具体配置"
        required
        :maxlength="64"
        clearable
      />
      <text class="field-label">备注</text>
      <wd-textarea
        v-model="form.remark"
        placeholder="可选，如路况、天气、对比车型"
        :maxlength="255"
        show-word-limit
      />
    </view>

    <view class="card">
      <text class="card-title">{{ DRIVE_SCORE_CATEGORY_LABEL.hardware }}</text>
      <view v-for="dim in hardwareDims" :key="dim.code" class="score-card">
        <text class="score-title">{{ dim.title }}</text>
        <text class="score-question">{{ dim.question }}</text>
        <wd-rate
          :model-value="scoreOf(dim.scoreKey)"
          :num="5"
          allow-half
          clearable
          size="22"
          @change="(val: any) => onRateChange(dim.scoreKey, val)"
        />
        <text v-if="scoreOf(dim.scoreKey)" class="score-hint">
          {{ getDriveScoreAnchorHint(dim, scoreOf(dim.scoreKey)) }}
        </text>
        <text class="guide-toggle" @click="toggleGuide(dim.code)">
          {{ guideOpen(dim) ? '收起怎么测' : '怎么测' }}
        </text>
        <view v-if="guideOpen(dim)" class="guide-body">
          <text class="guide-label">观察点</text>
          <text v-for="item in dim.checkpoints" :key="item" class="guide-item">· {{ item }}</text>
          <text class="guide-label">试驾方法</text>
          <text class="guide-item">{{ dim.method }}</text>
        </view>
      </view>
    </view>

    <view class="card">
      <text class="card-title">{{ DRIVE_SCORE_CATEGORY_LABEL.comfort }}</text>
      <view v-for="dim in comfortDims" :key="dim.code" class="score-card">
        <text class="score-title">{{ dim.title }}</text>
        <text class="score-question">{{ dim.question }}</text>
        <wd-rate
          :model-value="scoreOf(dim.scoreKey)"
          :num="5"
          allow-half
          clearable
          size="22"
          @change="(val: any) => onRateChange(dim.scoreKey, val)"
        />
        <text v-if="scoreOf(dim.scoreKey)" class="score-hint">
          {{ getDriveScoreAnchorHint(dim, scoreOf(dim.scoreKey)) }}
        </text>
        <text class="guide-toggle" @click="toggleGuide(dim.code)">
          {{ guideOpen(dim) ? '收起怎么测' : '怎么测' }}
        </text>
        <view v-if="guideOpen(dim)" class="guide-body">
          <text class="guide-label">观察点</text>
          <text v-for="item in dim.checkpoints" :key="item" class="guide-item">· {{ item }}</text>
          <text class="guide-label">试驾方法</text>
          <text class="guide-item">{{ dim.method }}</text>
        </view>
      </view>
    </view>

    <view class="footer-safe">
      <wd-button block type="primary" :disabled="!canSubmit" :loading="submitting" @click="onSubmit">
        {{ isEdit ? '保存修改' : '提交打分' }}
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

.card-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 16rpx;
}

.field-label {
  display: block;
  margin: 16rpx 0 8rpx;
  font-size: 28rpx;
  color: #1d2129;
}

.score-card + .score-card {
  margin-top: 28rpx;
  padding-top: 28rpx;
  border-top: 1rpx solid #f0f0f0;
}

.score-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #1d2129;
}

.score-question {
  display: block;
  margin: 8rpx 0 16rpx;
  font-size: 24rpx;
  color: #8a9199;
  line-height: 1.5;
}

.score-hint {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #4e5969;
  line-height: 1.5;
}

.guide-toggle {
  display: inline-block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: var(--wot-primary-6, #1688ff);
}

.guide-body {
  margin-top: 12rpx;
  padding: 16rpx;
  background: #f7f8fa;
  border-radius: 12rpx;
}

.guide-label {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #4e5969;
}

.guide-item {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #4e5969;
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

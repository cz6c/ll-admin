<script lang="ts" setup>
/**
 * 首页本年核对进度卡
 * 职责：展示 1–12 月状态、图例、摘要与 CTA；可点月格跳转核对/详情
 * 适用：salary/home；未来月不可点（无按压、无 toast）
 */
import type { YearMonthCell, YearMonthStatus, YearVerifyProgress } from '@/utils/salaryVerifyYearProgress'

defineOptions({ name: 'SalaryVerifyYearProgress' })

defineProps<{
  /** 本年进度视图模型 */
  progress: YearVerifyProgress
}>()

const emit = defineEmits<{
  /** 右侧「全部记录」 */
  openHistory: []
  /** 主按钮：去核对 / 核对记录 */
  cta: []
  /** 点击可交互月格 */
  monthClick: [cell: YearMonthCell]
}>()

/** 首访可读的状态图例（与格子配色一一对应） */
const LEGEND: { status: YearMonthStatus, label: string }[] = [
  { status: 'matched', label: '无误' },
  { status: 'mismatched', label: '有差异' },
  { status: 'missing', label: '待核' },
  { status: 'future', label: '未到' },
]

function cellClass(status: YearMonthCell['status']) {
  return `year-progress__cell--${status}`
}

function legendSwatchClass(status: YearMonthStatus) {
  return `year-progress__swatch--${status}`
}

/** 未来月不响应点击，避免「可点却无结果」的假控件感 */
function onCellClick(cell: YearMonthCell) {
  if (cell.status === 'future')
    return
  emit('monthClick', cell)
}
</script>

<template>
  <view class="year-progress">
    <view class="year-progress__header">
      <view class="year-progress__title">
        {{ progress.title }}
      </view>
      <view
        class="year-progress__all pressable"
        hover-class="pressable--pressed"
        :hover-stay-time="60"
        @click.stop="emit('openHistory')"
      >
        全部记录
      </view>
    </view>

    <view class="year-progress__legend">
      <view
        v-for="item in LEGEND"
        :key="item.status"
        class="year-progress__legend-item"
      >
        <view
          class="year-progress__swatch"
          :class="legendSwatchClass(item.status)"
        />
        <text class="year-progress__legend-label">
          {{ item.label }}
        </text>
      </view>
    </view>

    <view class="year-progress__grid">
      <view
        v-for="cell in progress.months"
        :key="cell.payPeriod"
        class="year-progress__cell"
        :class="[
          cellClass(cell.status),
          cell.status === 'future' ? 'year-progress__cell--inert' : '',
        ]"
        :hover-class="cell.status === 'future' ? '' : 'year-progress__cell--pressed'"
        :hover-stay-time="70"
        @click="onCellClick(cell)"
      >
        {{ cell.month }}
      </view>
    </view>

    <view class="year-progress__footer">
      <view class="year-progress__summary">
        {{ progress.summary }}
      </view>
      <view
        class="year-progress__cta"
        hover-class="year-progress__cta--pressed"
        :hover-stay-time="70"
        @click.stop="emit('cta')"
      >
        {{ progress.ctaLabel }}
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
/* 进度面板：浅底无描边，材质轻于工具卡；区块用间距分层，不用发丝线 */
.year-progress {
  margin-top: 32rpx;
  padding: 28rpx 28rpx 24rpx;
  border-radius: 24rpx;
  background: #f7f8fa;
}

.year-progress__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14rpx;
}

.year-progress__title {
  font-size: 28rpx;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: #1f2329;
}

.year-progress__all {
  font-size: 24rpx;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--wot-primary-6);
}

.year-progress__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx 20rpx;
  margin-bottom: 20rpx;
}

.year-progress__legend-item {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.year-progress__swatch {
  width: 16rpx;
  height: 16rpx;
  border-radius: 4rpx;
  flex-shrink: 0;
}

.year-progress__swatch--matched {
  background: var(--wot-success-main);
}

.year-progress__swatch--mismatched {
  background: var(--wot-warning-main);
}

.year-progress__swatch--missing {
  background: var(--wot-primary-1);
  border: 2rpx solid var(--wot-primary-3);
  box-sizing: border-box;
}

.year-progress__swatch--future {
  background: #e8eaed;
}

.year-progress__legend-label {
  font-size: 20rpx;
  color: #8a9199;
  line-height: 1.2;
}

.year-progress__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.year-progress__cell {
  box-sizing: border-box;
  width: calc((100% - 60rpx) / 6);
  height: 64rpx;
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  font-weight: 500;
  transition: transform 120ms var(--ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.year-progress__cell--pressed {
  transform: scale(0.96);
  opacity: 0.9;
}

.year-progress__cell--inert {
  /* 不可用态：无按压反馈，避免假按钮 */
  pointer-events: none;
}

.year-progress__cell--matched {
  color: #fff;
  background: var(--wot-success-main);
}

.year-progress__cell--mismatched {
  color: #fff;
  background: var(--wot-warning-main);
}

.year-progress__cell--missing {
  color: var(--wot-primary-6);
  background: #fff;
  border: 2rpx solid var(--wot-primary-3);
}

.year-progress__cell--future {
  color: #c0c4cc;
  background: #eef0f3;
}

.year-progress__footer {
  margin-top: 28rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.year-progress__summary {
  min-width: 0;
  flex: 1;
  font-size: 24rpx;
  font-weight: 400;
  letter-spacing: 0.01em;
  color: #666;
  line-height: 1.45;
}

.year-progress__cta {
  flex-shrink: 0;
  font-size: 24rpx;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--wot-success-main);
  background: var(--wot-success-surface, #ecfdf5);
  padding: 10rpx 22rpx;
  border-radius: 999rpx;
  transition: transform 140ms var(--ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.year-progress__cta--pressed {
  transform: scale(0.97);
}
</style>

<script lang="ts" setup>
/**
 * 薪算狮全屏加载
 * 职责：核对/测算请求期间展示迷你算盘拨珠，传达「正在计算」过程感
 * 适用：salary/verify、salary/calc 识别与落库等待
 * 为何纯 CSS 算盘：狮图脉冲过程感弱且素材未稳定接入；只动 transform/opacity，微信小程序更稳
 */

defineOptions({ name: 'SalaryAbacusLoading' })

withDefaults(
  defineProps<{
    /** 为 true 时全屏展示 */
    visible: boolean
    /** 底部提示文案 */
    tip?: string
  }>(),
  {
    tip: '薪算狮正在整理…',
  },
)

/** 六杆竖算盘；每杆一颗停靠珠 + 一颗拨动珠，错峰上下滑动制造「在算」感 */
const RAILS = [0, 1, 2, 3, 4, 5] as const
</script>

<template>
  <view
    v-if="visible"
    class="abacus-loading"
  >
    <view class="abacus-loading__panel">
      <view
        class="abacus-loading__abacus"
        aria-hidden="true"
      >
        <view
          v-for="rail in RAILS"
          :key="rail"
          class="abacus-loading__rail"
          :class="`abacus-loading__rail--${rail}`"
        >
          <view class="abacus-loading__rod" />
          <view class="abacus-loading__bead abacus-loading__bead--park" />
          <view class="abacus-loading__bead abacus-loading__bead--park1" />
          <view class="abacus-loading__bead abacus-loading__bead--move" />
        </view>
      </view>

      <view class="abacus-loading__hint">
        <view class="abacus-loading__tip">
          {{ tip }}
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
/* 偶发加载：进场要立刻有反应；屏上往复用强 ease-in-out */
$ease-out-strong: var(--ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
$ease-in-out-strong: var(--ease-in-out-strong, cubic-bezier(0.77, 0, 0.175, 1));
/* 略快于 1.2s：同等待时长下「拨得勤」会显得更轻 */
$bead-cycle: 1s;

.abacus-loading {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  justify-content: center;
  /* 不用 backdrop-filter：微信端模糊不一致，半透明白底足够挡住误触 */
  background: rgba(255, 255, 255, 0.82);
  animation: loading-veil-in 180ms $ease-out-strong both;
}

.abacus-loading__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 50%;
  gap: 28rpx;
  animation: loading-panel-in 200ms $ease-out-strong both;
}

.abacus-loading__abacus {
  box-sizing: border-box;
  width: 268rpx;
  height: 168rpx;
  padding: 0rpx 16rpx;
  border-radius: 20rpx;
  border: 2rpx solid var(--wot-primary-3);
  background: var(--wot-primary-1);
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: stretch;
}

.abacus-loading__rail {
  position: relative;
  width: 28rpx;
  flex: 0 0 28rpx;
}

.abacus-loading__rod {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 4rpx;
  margin-left: -2rpx;
  border-radius: 999rpx;
  background: var(--wot-primary-3);
}

.abacus-loading__bead {
  position: absolute;
  left: 50%;
  width: 24rpx;
  height: 24rpx;
  margin-left: -12rpx;
  border-radius: 50%;
  background: var(--wot-primary-6);
}

/* 停靠珠：固定在顶端，对照真实算盘「一边静、一边拨」 */
.abacus-loading__bead--park {
  top: 8rpx;
  background: var(--wot-primary-4);
}
/* 停靠珠：固定在顶端，对照真实算盘「一边静、一边拨」 */
.abacus-loading__bead--park1 {
  bottom: 8rpx;
  background: var(--wot-primary-4);
}

.abacus-loading__bead--move {
  top: 36rpx;
  /* 只动 transform，避免 top 动画触发布局 */
  animation: bead-slide $bead-cycle $ease-in-out-strong infinite;
}

.abacus-loading__rail--1 .abacus-loading__bead--move {
  animation-delay: 0.08s;
}

.abacus-loading__rail--2 .abacus-loading__bead--move {
  animation-delay: 0.16s;
}

.abacus-loading__rail--3 .abacus-loading__bead--move {
  animation-delay: 0.24s;
  /* 中后段反向拨，避免六杆同向像均衡器进度条 */
  animation-name: bead-slide-reverse;
  top: auto;
  bottom: 36rpx;
}

.abacus-loading__rail--4 .abacus-loading__bead--move {
  animation-delay: 0.32s;
  animation-name: bead-slide-reverse;
  top: auto;
  bottom: 36rpx;
}

.abacus-loading__rail--5 .abacus-loading__bead--move {
  animation-delay: 0.4s;
  animation-name: bead-slide-reverse;
  top: auto;
  bottom: 36rpx;
}

.abacus-loading__hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.abacus-loading__tip {
  font-size: 28rpx;
  color: var(--wot-primary-6);
  letter-spacing: 1rpx;
}

@keyframes loading-veil-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes loading-panel-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 拨到远端稍停，模拟珠子靠拢后的一瞬 */
@keyframes bead-slide {
  0%,
  100% {
    transform: translateY(0);
  }

  42%,
  58% {
    transform: translateY(64rpx);
  }
}

@keyframes bead-slide-reverse {
  0%,
  100% {
    transform: translateY(0);
  }

  42%,
  58% {
    transform: translateY(-64rpx);
  }
}

@media (prefers-reduced-motion: reduce) {
  .abacus-loading,
  .abacus-loading__panel {
    animation: none;
  }

  .abacus-loading__bead--move {
    animation: none;
  }
}
</style>

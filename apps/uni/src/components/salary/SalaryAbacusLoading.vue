<script lang="ts" setup>
/**
 * 薪算狮全屏加载
 * 职责：核对/测算提交接口请求期间展示海报同款狮形象 + 克制动效
 * 适用：salary/verify、salary/calc 落库请求中
 */
import { LION_URL } from '@/utils/lionAssets'

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
</script>

<template>
  <view
    v-if="visible"
    class="abacus-loading"
  >
    <view class="abacus-loading__panel">
      <image
        class="abacus-loading__lion"
        :src="LION_URL"
        mode="aspectFit"
      />
      <view class="abacus-loading__hint">
        {{ tip }}
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.abacus-loading {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
}

.abacus-loading__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28rpx;
}

.abacus-loading__lion {
  width: 168rpx;
  height: 168rpx;
  animation: lion-pulse 2s ease-in-out infinite;
}

.abacus-loading__hint {
  font-size: 28rpx;
  color: var(--wot-primary-6);
  letter-spacing: 1rpx;
}

@keyframes lion-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.75;
  }
}
</style>

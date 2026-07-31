<script lang="ts" setup>
/**
 * 薪算狮空状态
 * 职责：历史列表空态展示海报同款狮形象；真空仓引导核对，筛选无结果换文案
 * 适用：salary/history
 */
import { LION_URL } from '@/utils/lionAssets'

defineOptions({ name: 'SalaryLionEmpty' })

withDefaults(
  defineProps<{
    /** 主标题 */
    title?: string
    /** 副文案 */
    desc?: string
    /** 是否展示「去核对工资条」按钮 */
    showAction?: boolean
  }>(),
  {
    title: '还没有记录',
    desc: '发工资条了？我在这儿帮你算清楚',
    showAction: true,
  },
)

function goVerify() {
  uni.navigateTo({ url: '/pages/salary/verify' })
}
</script>

<template>
  <view class="lion-empty">
    <view class="lion-empty__mascot">
      <image
        class="lion-empty__lion"
        :src="LION_URL"
        mode="aspectFit"
      />
    </view>

    <view class="lion-empty__title">
      {{ title }}
    </view>
    <view class="lion-empty__desc">
      {{ desc }}
    </view>

    <view
      v-if="showAction"
      class="lion-empty__btn"
      @click="goVerify"
    >
      去核对工资条
    </view>
  </view>
</template>

<style scoped lang="scss">
.lion-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 0;
  color: #999999;
}

.lion-empty__mascot {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24rpx;
}

.lion-empty__lion {
  width: 134rpx;
  height: 134rpx;
  opacity: 0.8;
}

.lion-empty__title {
  font-size: 32rpx;
}

.lion-empty__desc {
  margin-top: 12rpx;
  font-size: 24rpx;
  text-align: center;
}

.lion-empty__btn {
  margin-top: 34rpx;
  font-size: 28rpx;
  color: var(--wot-primary-6);
}
</style>

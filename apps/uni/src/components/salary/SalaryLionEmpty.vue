<script lang="ts" setup>
/**
 * 薪算狮空状态
 * 职责：真空仓引导核对，筛选无结果换文案
 * 适用：salary/history
 */

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
    <view class="lion-empty__title">
      {{ title }}
    </view>
    <view class="lion-empty__desc">
      {{ desc }}
    </view>

    <view
      v-if="showAction"
      class="lion-empty__btn"
      hover-class="lion-empty__btn--pressed"
      :hover-stay-time="70"
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
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
}

.lion-empty__btn--pressed {
  transform: scale(0.97);
  opacity: 0.9;
}
</style>

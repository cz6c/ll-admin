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
  padding: 96rpx 32rpx 80rpx;
}

/* 标题更深、描述次级：层级靠对比而不只靠字号 */
.lion-empty__title {
  font-size: 32rpx;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: #1f2329;
}

.lion-empty__desc {
  margin-top: 12rpx;
  font-size: 24rpx;
  letter-spacing: 0.01em;
  line-height: 1.45;
  text-align: center;
  color: #8a9199;
}

.lion-empty__btn {
  margin-top: 36rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--wot-success-main);
  padding: 14rpx 32rpx;
  border-radius: 999rpx;
  background: var(--wot-success-surface, #ecfdf5);
  transition: transform 140ms var(--ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.lion-empty__btn--pressed {
  transform: scale(0.97);
  opacity: 0.9;
}
</style>

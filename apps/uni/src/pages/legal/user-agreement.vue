<script lang="ts" setup>
/**
 * 用户服务协议页
 * 职责：展示 USER_AGREEMENT_CONTENT 全文，供门禁弹窗《用户协议》跳转阅读
 */
import { USER_AGREEMENT_CONTENT, USER_AGREEMENT_TITLE } from '@/constants/privacy'

defineOptions({ name: 'UserAgreement' })

// definePage 必须字面量：导入常量会导致 uni-pages 解析 meta 失败并触发 tabBar 构建报错
definePage({
  style: {
    navigationBarTitleText: '用户服务协议',
  },
})
</script>

<template>
  <scroll-view scroll-y class="box-border h-screen bg-white">
    <view class="py-24rpx px-32rpx">
      <view class="mb-24rpx text-32rpx text-#333 font-600 ">
        {{ USER_AGREEMENT_TITLE }}
      </view>
      <text class="whitespace-pre-wrap text-28rpx text-#666 leading-relaxed">{{ USER_AGREEMENT_CONTENT }}</text>
      <view class="h-48rpx" />
    </view>
  </scroll-view>
</template>

<script lang="ts" setup>
/**
 * 隐私保护指引页
 * 职责：展示 PRIVACY_POLICY_CONTENT 全文，供门禁弹窗《隐私政策》跳转阅读
 */
import { PRIVACY_POLICY_CONTENT, PRIVACY_POLICY_TITLE } from '@/constants/privacy'

defineOptions({ name: 'PrivacyPolicy' })

// definePage 必须字面量：导入常量会导致 uni-pages 解析 meta 失败并触发 tabBar 构建报错
definePage({
  style: {
    navigationBarTitleText: '隐私保护指引',
  },
})
</script>

<template>
  <scroll-view scroll-y class="box-border h-screen bg-white">
    <view class="py-24rpx px-32rpx">
      <view class="mb-24rpx text-32rpx text-#333 font-600">
        {{ PRIVACY_POLICY_TITLE }}
      </view>
      <text class="whitespace-pre-wrap text-28rpx text-#666 leading-relaxed">{{ PRIVACY_POLICY_CONTENT }}</text>
      <view class="h-48rpx" />
    </view>
  </scroll-view>
</template>

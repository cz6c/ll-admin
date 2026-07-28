<script lang="ts" setup>
/**
 * 隐私协议门禁空白页
 * 主流程：未同意时由首页/核对页 redirect 至此 → 页内弹窗 → 可 navigateTo 协议正文 → 同意后 reLaunch 回跳或首页
 */
import { onShow } from '@dcloudio/uni-app'
import PrivacyAgreementPopup from '@/components/PrivacyAgreementPopup.vue'
import { consumePrivacyReturnUrl, hasPrivacyAgreed } from '@/constants/privacy'

defineOptions({ name: 'PrivacyGate' })

definePage({
  style: {
    navigationStyle: 'custom',
    navigationBarTitleText: '用户协议',
  },
})

onShow(() => {
  // 已同意却落到本页（如返回栈异常）时走回跳白名单，否则首页
  if (hasPrivacyAgreed())
    uni.reLaunch({ url: consumePrivacyReturnUrl() })
})
</script>

<template>
  <view class="min-h-screen bg-#f5f5f5">
    <PrivacyAgreementPopup />
  </view>
</template>

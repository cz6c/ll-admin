<script lang="ts" setup>
/**
 * 隐私协议门禁空白页
 * 主流程：未同意时由首页 redirect 至此 → 页内弹窗 → 可 navigateTo 协议正文（页面栈）→ 同意后 reLaunch 首页
 */
import { onShow } from '@dcloudio/uni-app'
import PrivacyAgreementPopup from '@/components/PrivacyAgreementPopup.vue'
import { APP_HOME_PATH, hasPrivacyAgreed } from '@/constants/privacy'

defineOptions({ name: 'PrivacyGate' })

definePage({
  style: {
    navigationStyle: 'custom',
    navigationBarTitleText: '用户协议',
  },
})

onShow(() => {
  // 已同意却落到本页（如返回栈异常）时直接进首页
  if (hasPrivacyAgreed())
    uni.reLaunch({ url: APP_HOME_PATH })
})
</script>

<template>
  <view class="min-h-screen bg-#f5f5f5">
    <PrivacyAgreementPopup />
  </view>
</template>

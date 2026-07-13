<script lang="ts" setup>
import { PRIVACY_AGREED_KEY, PRIVACY_CONTENT } from '@/constants/privacy'

const showPrivacy = ref(false)

function checkPrivacy() {
  if (!uni.getStorageSync(PRIVACY_AGREED_KEY))
    showPrivacy.value = true
}

function agreePrivacy() {
  uni.setStorageSync(PRIVACY_AGREED_KEY, true)
  showPrivacy.value = false
}

function rejectPrivacy() {
  uni.showModal({
    title: '提示',
    content: '需同意用户协议和隐私政策后才能使用本小程序',
    showCancel: false,
  })
}

defineExpose({ checkPrivacy })
</script>

<template>
  <wd-popup v-model="showPrivacy" custom-class="rounded-24rpx" :close-on-click-modal="false">
    <view class="w-600rpx rounded-24rpx bg-white p-40rpx">
      <view class="mb-24rpx text-center text-34rpx text-#333 font-600">
        用户协议与隐私政策
      </view>
      <scroll-view scroll-y class="max-h-560rpx">
        <text class="whitespace-pre-wrap text-26rpx text-#666 leading-relaxed">{{ PRIVACY_CONTENT }}</text>
      </scroll-view>
      <view class="mt-32rpx flex gap-24rpx">
        <wd-button variant="plain" custom-class="flex-1" @click="rejectPrivacy">
          不同意
        </wd-button>
        <wd-button type="primary" custom-class="flex-1" @click="agreePrivacy">
          同意并继续
        </wd-button>
      </view>
    </view>
  </wd-popup>
</template>

<script lang="ts" setup>
/**
 * 隐私协议门禁弹窗（仅挂在 privacy-gate 空白页）
 * 主流程：常显弹窗 → 点协议 navigateTo（本页入栈下方，返回自动回来）→ 同意后 reLaunch 首页
 */
import {
  APP_HOME_PATH,
  PRIVACY_AGREED_KEY,
  PRIVACY_POLICY_PATH,
  PRIVACY_POPUP_INTRO,
  USER_AGREEMENT_PATH,
} from '@/constants/privacy'

/** 门禁页常显；进协议页靠页面栈盖住，无需手动关闭 */
const showPrivacy = ref(true)

function agreePrivacy() {
  uni.setStorageSync(PRIVACY_AGREED_KEY, true)
  showPrivacy.value = false
  uni.reLaunch({ url: APP_HOME_PATH })
}

function rejectPrivacy() {
  uni.showModal({
    title: '提示',
    content: '需同意用户协议和隐私政策后才能使用本小程序',
    showCancel: false,
  })
}

function openUserAgreement() {
  uni.navigateTo({ url: USER_AGREEMENT_PATH })
}

function openPrivacyPolicy() {
  uni.navigateTo({ url: PRIVACY_POLICY_PATH })
}
</script>

<template>
  <wd-popup v-model="showPrivacy" custom-class="rounded-24rpx" :close-on-click-modal="false">
    <view class="w-600rpx rounded-24rpx bg-white p-40rpx">
      <view class="mb-24rpx text-center text-34rpx text-#333 font-600">
        用户协议与隐私政策
      </view>
      <view  >
        <text class="whitespace-pre-wrap text-26rpx text-#666 leading-relaxed">{{ PRIVACY_POPUP_INTRO }}</text>
        <view class="mt-8rpx text-26rpx leading-relaxed">
          <text class="text-primary underline" @click="openUserAgreement">
            《用户协议》
          </text>
          <text class="text-#666">
            和
          </text>
          <text class="text-primary underline" @click="openPrivacyPolicy">
            《隐私政策》
          </text>
        </view>
      </view>
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

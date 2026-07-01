<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { useWifiHistoryStore } from '@/store/wifiHistory'
import { attemptConnectWifi, parseWifiQr, toScanResultQuery } from '@/utils/wifi'

defineOptions({ name: 'Home' })

definePage({
  style: {
    navigationBarTitleText: 'WiFi小助手',
  },
})

const wifiHistoryStore = useWifiHistoryStore()
const { count: historyCount } = storeToRefs(wifiHistoryStore)

function handleScan() {
  uni.scanCode({
    onlyFromCamera: true,
    scanType: ['qrCode'],
    success(res) {
      const raw = res.result?.trim() ?? ''
      if (!raw) {
        uni.showToast({ title: '未识别到有效内容', icon: 'none' })
        return
      }
      const info = parseWifiQr(raw)
      if (!info) {
        uni.navigateTo({
          url: `/pages-sub/wifi/scanResult?invalid=1&raw=${encodeURIComponent(raw)}`,
        })
        return
      }
      wifiHistoryStore.add(info, 'scanned')
      uni.showLoading({ title: '正在连接 WiFi...', mask: true })
      attemptConnectWifi({
        ssid: info.ssid,
        password: info.password,
        onSuccess: () => {
          uni.hideLoading()
          uni.navigateTo({
            url: `/pages-sub/wifi/scanResult?${toScanResultQuery(info, true)}`,
          })
        },
        onFail: () => {
          uni.hideLoading()
          uni.navigateTo({
            url: `/pages-sub/wifi/scanResult?${toScanResultQuery(info, false)}`,
          })
        },
        onComplete: () => uni.hideLoading(),
      })
    },
    fail(err) {
      const msg = String(err?.errMsg ?? '')
      if (msg.includes('auth deny') || msg.includes('authorize') || msg.includes('permission')) {
        uni.showModal({
          title: '需要相机权限',
          content: '需要相机权限才能扫码，请在设置中开启相机权限',
          confirmText: '去设置',
          success(res) {
            if (res.confirm)
              uni.openSetting({})
          },
        })
        return
      }
      if (!msg.includes('cancel'))
        uni.showToast({ title: '扫码失败，请重试', icon: 'none' })
    },
  })
}

function goGenerate() {
  uni.navigateTo({ url: '/pages-sub/wifi/generate' })
}

function goHistory() {
  uni.navigateTo({ url: '/pages-sub/wifi/history' })
}
</script>

<template>
  <view class="home-page px-48rpx pb-80rpx">
    <view class="h-360rpx center flex-col text-white">
      <view class="center">
        <wd-icon name="wifi" size="136rpx" color="#fff" />
      </view>
      <view class="text-56rpx font-700 tracking-2rpx">
        WiFi小助手
      </view>
      <view class="mt-16rpx text-28rpx opacity-85">
        扫码连网 · 分享 WiFi
      </view>
    </view>

    <view class="mt-80rpx flex flex-col gap-32rpx">
      <wd-button
        round block
        size="large"
        variant="plain"
        @click="handleScan"
      >
        <view class="center gap-20rpx">
          <wd-icon name="camera" size="40rpx" />
          <text>扫码直连</text>
        </view>
      </wd-button>
      <wd-button
        size="large"
        round block
        @click="goGenerate"
      >
        <view class="center gap-20rpx">
          <wd-icon name="picture" size="40rpx" />
          <text>生成WiFi码</text>
        </view>
      </wd-button>
    </view>

    <wd-cell
      v-if="historyCount > 0"
      title="历史记录"
      is-link center
      :title-width="100"
      custom-class="mt-80rpx rounded-24rpx overflow-hidden shadow-sm"
      @click="goHistory"
    >
      <wd-badge :value="historyCount" />
    </wd-cell>
  </view>
</template>

<style scoped lang="scss">
.home-page {
  min-height: 100vh;
  background: linear-gradient(180deg, var(--wot-primary-6) 0%, var(--wot-primary-6) 360rpx, #f5f5f5 360rpx);
}
</style>

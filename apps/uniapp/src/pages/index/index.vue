<!-- 使用 type="home" 属性设置首页，其他页面不需要设置，默认为page；推荐使用json5，更强大，且允许注释 -->
<route lang="json5" type="home">
{
  layout: "tabbar",
  style: {
    // 'custom' 表示开启自定义导航栏，默认 'default'
    navigationStyle: "custom",
    navigationBarTitleText: "首页"
  }
}
</route>

<script lang="ts" setup>
import { useMessage, useToast } from 'wot-design-uni'
import PLATFORM from '@/utils/platform'

defineOptions({
  name: 'Home',
})

// 获取屏幕边界到安全区域距离
let safeAreaInsets
let systemInfo

// #ifdef MP-WEIXIN
// 微信小程序使用新的API
systemInfo = uni.getWindowInfo()
safeAreaInsets = systemInfo.safeArea
  ? {
      top: systemInfo.safeArea.top,
      right: systemInfo.windowWidth - systemInfo.safeArea.right,
      bottom: systemInfo.windowHeight - systemInfo.safeArea.bottom,
      left: systemInfo.safeArea.left,
    }
  : null
// #endif

// #ifndef MP-WEIXIN
// 其他平台继续使用uni API
systemInfo = uni.getSystemInfoSync()
safeAreaInsets = systemInfo.safeAreaInsets
// #endif

// 测试 uni API 自动引入
onLoad(() => {
  console.log(safeAreaInsets)
})

console.log('index')

const toast = useToast()

function showToast() {
  toast.show('提示信息')
}

const message = useMessage()

function confirm() {
  message
    .confirm({
      title: '标题',
      // msg: '提示文案',
    })
    .then(() => {
      console.log('点击了确定按钮')
    })
    .catch(() => {
      console.log('点击了取消按钮')
    })
}

function toWebView(url) {
  uni.navigateTo({ url: `/pages/webView/webView?linkUrl=${url}` })
}
</script>

<template>
  <view class="px-4" :style="{ marginTop: `${safeAreaInsets?.top}px` }">
    <view class="my-8 text-center text-4 font-500">
      示例
    </view>
    <view class="border-rd-4 bg-white p-4">
      <wd-cell title="请求" is-link to="/pages-sub/demo/request/index" />
      <wd-cell title="z-paging" is-link to="/pages-sub/demo/z-paging/index" />
      <wd-cell title="webView" is-link @click="toWebView('https://www.toysbear.com/protocolApp.html')" />
      <wd-cell title="toast" is-link @click="showToast" />
      <wd-cell title="confirm" is-link @click="confirm" />
    </view>
    <view class="mt-8 text-center">
      当前平台是：
      <text class="text-green-500">
        {{ PLATFORM.platform }}
      </text>
    </view>
  </view>
</template>

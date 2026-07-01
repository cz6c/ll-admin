<script lang="ts" setup>
import { copyToClipboard } from '@/utils/clipboard'
import { attemptConnectWifi } from '@/utils/wifi'

defineOptions({ name: 'ScanResult' })

definePage({
  style: {
    navigationBarTitleText: '扫码结果',
  },
})

const invalid = ref(false)
const ssid = ref('')
const password = ref('')
const hidden = ref(false)
const connecting = ref(false)
const showHiddenConnectFail = ref(false)
/** 扫码自动连接结果；null 表示来自历史记录等非扫码入口 */
const connectStatus = ref<'success' | 'fail' | null>(null)

const passwordHint = computed(() => (password.value ? '********' : '（无密码）'))
const hiddenLabel = computed(() => (hidden.value ? '是' : '否'))
const connectStatusLabel = computed(() => {
  if (connectStatus.value === 'success')
    return '已成功连接'
  if (connectStatus.value === 'fail')
    return '连接失败'
  return '—'
})

onLoad((query) => {
  if (query?.invalid === '1') {
    invalid.value = true
    return
  }
  ssid.value = decodeURIComponent(String(query?.ssid ?? ''))
  password.value = decodeURIComponent(String(query?.password ?? ''))
  hidden.value = query?.hidden === '1' || query?.hidden === 'true'
  if (query?.connected === '1') {
    connectStatus.value = 'success'
  }
  else if (query?.connected === '0') {
    connectStatus.value = 'fail'
    if (hidden.value)
      showHiddenConnectFail.value = true
  }
})

function copySsid() {
  if (!ssid.value) {
    uni.showToast({ title: '网络名称为空', icon: 'none' })
    return
  }
  copyToClipboard(ssid.value, 'SSID 已复制')
}

function copyPassword() {
  if (!password.value) {
    uni.showToast({ title: '该网络无密码', icon: 'none' })
    return
  }
  copyToClipboard(password.value, '密码已复制')
}

function showConnectFailModal() {
  setTimeout(() => {
    if (hidden.value) {
      showHiddenConnectFail.value = true
      return
    }
    uni.showModal({
      title: '连接失败',
      content: `连接失败，请前往系统设置手动连接\n\n网络名称：${ssid.value}\n请先点击「复制密码」获取密码`,
      confirmText: '复制密码',
      cancelText: '知道了',
      success(res) {
        if (res.confirm)
          copyPassword()
      },
    })
  }, 100)
}

function retryConnect() {
  if (connecting.value)
    return
  connecting.value = true

  // #ifdef MP-WEIXIN
  attemptConnectWifi({
    ssid: ssid.value,
    password: password.value,
    onSuccess: () => {
      connectStatus.value = 'success'
      uni.showToast({ title: '连接成功', icon: 'success' })
    },
    onFail: () => {
      connectStatus.value = 'fail'
      showConnectFailModal()
    },
    onComplete: () => {
      connecting.value = false
    },
  })
  // #endif

  // #ifndef MP-WEIXIN
  connecting.value = false
  uni.showModal({
    title: '提示',
    content: 'WiFi 自动连接仅支持微信小程序环境，请手动连接网络',
    showCancel: false,
  })
  // #endif
}

function goHome() {
  uni.navigateBack({
    fail: () => uni.reLaunch({ url: '/pages-sub/wifi/index' }),
  })
}
</script>

<template>
  <view class="page-shell p-40rpx">
    <view v-if="invalid" class="mt-80rpx rounded-32rpx bg-white p-48rpx text-center">
      <wd-empty tip="无效的WiFi二维码" />
      <view class="mt-16rpx text-28rpx text-#999 leading-relaxed">
        扫描内容不是标准 WiFi 二维码格式，请确认二维码是否正确
      </view>
      <wd-button round block type="primary" custom-class="mt-48rpx" @click="goHome">
        返回首页
      </wd-button>
    </view>

    <template v-else>
      <wd-cell-group center border custom-class="card-rounded" :title-width="100">
        <wd-cell title="网络名称" :value="ssid" />
        <wd-cell title="密码" :value="passwordHint" />
        <wd-cell title="是否隐藏WiFi" :value="hiddenLabel" />
        <wd-cell
          v-if="connectStatus !== null"
          title="连接状态"
          :value="connectStatusLabel"
        />
      </wd-cell-group>

      <view
        v-if="connectStatus === 'fail' && !hidden"
        class="mt-24rpx rounded-16rpx bg-#fff7e6 px-24rpx py-20rpx text-26rpx text-#666 leading-relaxed"
      >
        自动连接失败，请前往系统设置手动连接，或点击下方按钮重试。
      </view>

      <view class="flex-actions mt-48rpx">
        <wd-button
          v-if="hidden"
          variant="plain"
          round
          block
          custom-class="flex-1"
          @click="copySsid"
        >
          复制SSID
        </wd-button>
        <wd-button variant="plain" round block custom-class="flex-1" @click="copyPassword">
          复制密码
        </wd-button>
        <wd-button
          round
          block
          type="primary"
          :loading="connecting"
          custom-class="flex-1"
          @click="retryConnect"
        >
          重新连接
        </wd-button>
      </view>
    </template>

    <wd-popup
      v-model="showHiddenConnectFail"
      position="center"
      :root-portal="true"
      :z-index="500"
      closable
      custom-class="hidden-connect-fail-popup"
    >
      <view class="w-600rpx rounded-24rpx bg-white p-40rpx">
        <view class="mb-24rpx text-center text-34rpx text-#333 font-600">
          连接失败
        </view>
        <view class="text-28rpx text-#666 leading-relaxed">
          该网络为隐藏WiFi，无法在列表中手动选择。请前往手机「设置 > WiFi > 手动添加网络」，输入名称【{{ ssid }}】和密码进行连接。
        </view>
        <view class="flex-actions mt-40rpx">
          <wd-button variant="plain" round block custom-class="flex-1" @click="copySsid">
            复制SSID
          </wd-button>
          <wd-button round block type="primary" custom-class="flex-1" @click="copyPassword">
            复制密码
          </wd-button>
        </view>
        <wd-button
          round
          block
          variant="plain"
          custom-class="mt-24rpx"
          @click="showHiddenConnectFail = false"
        >
          知道了
        </wd-button>
      </view>
    </wd-popup>
  </view>
</template>

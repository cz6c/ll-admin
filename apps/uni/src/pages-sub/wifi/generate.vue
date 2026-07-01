<script lang="ts" setup>
import type { FormSchema } from '@wot-ui/ui'
import type { FormExpose } from '@wot-ui/ui/components/wd-form/types'
import type { ComponentPublicInstance } from 'vue'
import { getCurrentInstance } from 'vue'
import { useWifiHistoryStore } from '@/store/wifiHistory'
import { saveCanvasToAlbum } from '@/utils/canvasExport'
import { drawQrCode } from '@/utils/drawQrCode'
import { buildWifiQr } from '@/utils/wifi'

defineOptions({ name: 'Generate' })

/** 小程序端 canvas API 需传入页面/组件实例 */
const canvasHost = getCurrentInstance()?.proxy as ComponentPublicInstance | undefined

definePage({
  style: {
    navigationBarTitleText: '生成WiFi码',
  },
})

const wifiHistoryStore = useWifiHistoryStore()

const canvasId = 'wifiQrCanvas'
/** 二维码展示尺寸（rpx），绘制时转为 px */
const qrSizeRpx = 480

const formRef = ref<FormExpose>()
const formModel = reactive({
  ssid: '',
  password: '',
  hidden: false,
})

const formSchema: FormSchema = {
  validate(model) {
    if (!String(model.ssid ?? '').trim())
      return [{ path: ['ssid'], message: '请输入WiFi名称' }]
    return []
  },
  isRequired(path) {
    return path === 'ssid'
  },
}

const qrGenerated = ref(false)
const qrText = ref('')
const saving = ref(false)

const qrCanvasStyle = computed(() => ({
  width: `${qrSizeRpx}rpx`,
  height: `${qrSizeRpx}rpx`,
}))

function getQrSizePx() {
  return uni.upx2px(qrSizeRpx)
}

async function renderQr(addToHistory: boolean) {
  const info = {
    ssid: formModel.ssid.trim(),
    password: formModel.password,
    hidden: formModel.hidden,
  }
  qrText.value = buildWifiQr(info)
  qrGenerated.value = true

  await nextTick()
  const sizePx = getQrSizePx()
  await drawQrCode(canvasId, qrText.value, sizePx, canvasHost)
  if (addToHistory)
    wifiHistoryStore.add(info, 'generated')
}

/** 从历史记录进入时，onReady 后自动出码 */
const pendingHistoryGenerate = ref(false)

onLoad((query) => {
  const id = query?.id as string | undefined
  if (id) {
    const item = wifiHistoryStore.findById(id)
    if (item) {
      formModel.ssid = item.ssid
      formModel.password = item.password
      formModel.hidden = item.hidden ?? false
      if (item.type === 'generated')
        pendingHistoryGenerate.value = true
      return
    }
  }
  if (query?.ssid)
    formModel.ssid = decodeURIComponent(String(query.ssid))
  if (query?.password)
    formModel.password = decodeURIComponent(String(query.password))
})

onReady(async () => {
  if (!pendingHistoryGenerate.value)
    return
  pendingHistoryGenerate.value = false
  await renderQr(false)
})

async function handleGenerate() {
  const { valid } = await formRef.value!.validate()
  if (!valid)
    return

  await renderQr(true)
  uni.showToast({ title: '二维码已生成', icon: 'success' })
}

async function saveToAlbum() {
  if (!qrGenerated.value)
    return
  saving.value = true
  try {
    const sizePx = getQrSizePx()
    await saveCanvasToAlbum({
      canvasId,
      width: sizePx,
      height: sizePx,
      canvasHost,
    })
    uni.showToast({ title: '已保存到相册', icon: 'success' })
  }
  catch {
    // 具体错误已在 saveCanvasToAlbum 中提示
  }
  finally {
    saving.value = false
  }
}

function handleShare() {
  uni.showModal({
    title: '分享提示',
    content: '请先保存二维码到相册，再通过微信发送给好友',
    showCancel: false,
  })
}
</script>

<template>
  <view class="page-shell px-32rpx pb-80rpx pt-32rpx">
    <wd-form
      ref="formRef"
      :model="formModel"
      :schema="formSchema"
      center
      border
      error-type="toast"
      :title-width="100"
      value-align="right"
      custom-class="card-rounded generate-form"
    >
      <wd-form-item title="WiFi名称" prop="ssid">
        <wd-input
          v-model="formModel.ssid"
          align-right
          placeholder="请输入网络名称（SSID）"
          custom-class="flex-1"
        />
      </wd-form-item>
      <wd-form-item title="密码" prop="password">
        <wd-input
          v-model="formModel.password"
          align-right
          show-password
          placeholder="无密码可留空"
          custom-class="flex-1"
        />
      </wd-form-item>
      <wd-form-item title="是否为隐藏WiFi" :title-width="200" prop="hidden">
        <wd-switch v-model="formModel.hidden" size="20" />
      </wd-form-item>
    </wd-form>

    <wd-button
      round block
      size="large"
      type="primary"
      custom-class="mt-40rpx"
      @click="handleGenerate"
    >
      生成二维码
    </wd-button>

    <view v-if="qrGenerated" class="mt-48rpx rounded-24rpx bg-white p-48rpx text-center">
      <view class="center">
        <canvas
          :id="canvasId"
          :canvas-id="canvasId"
          class="block"
          :style="qrCanvasStyle"
        />
      </view>
      <view class="mt-40rpx flex-actions">
        <wd-button
          variant="plain" round block
          :loading="saving"
          custom-class="flex-1"
          @click="saveToAlbum"
        >
          保存到相册
        </wd-button>
        <wd-button
          round block
          type="primary"
          custom-class="flex-1"
          @click="handleShare"
        >
          分享
        </wd-button>
      </view>
    </view>
  </view>
</template>

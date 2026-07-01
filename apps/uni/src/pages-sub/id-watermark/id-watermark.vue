<script lang="ts" setup>
import type { ComponentPublicInstance } from 'vue'
import { getCurrentInstance, nextTick, reactive, ref, watch } from 'vue'
import { saveCanvasToAlbum } from '@/utils/canvasExport'

defineOptions({ name: 'IdWatermark' })

/** 小程序端 canvas API 需传入页面/组件实例 */
const canvasHost = getCurrentInstance()?.proxy as ComponentPublicInstance | undefined

definePage({
  style: {
    navigationBarTitleText: '证件照片加水印',
  },
})

const canvasId = 'idWatermarkCanvas'

const imagePath = ref('')
const imgW = ref(0)
const imgH = ref(0)

type WatermarkColor = '#ffffff' | '#000000' | '#E53935'

const formModel = reactive({
  watermarkText: '仅用于办理 XXX 使用',
  color: '#000000' as WatermarkColor,
  opacity: 20,
  spacing: 59,
  fontSize: 20,
  angleDeg: -45 as -30 | -45 | -60,
})

const colors: { value: WatermarkColor, label: string }[] = [
  { value: '#ffffff', label: '白' },
  { value: '#000000', label: '黑' },
  { value: '#E53935', label: '红' },
]

/** 逆时针角度（与常见斜向水印一致） */
const anglePresets = [
  { deg: -30, title: '较缓' },
  { deg: -45, title: '常用' },
  { deg: -60, title: '较陡' },
] as const

const canvasStyle = ref<{ width: string, height: string }>({ width: '100%', height: '400rpx' })
const canvasW = ref(300)
const canvasH = ref(300)

const saving = ref(false)

let drawTimer: ReturnType<typeof setTimeout> | null = null

function scheduleDraw() {
  if (!imagePath.value)
    return
  if (drawTimer)
    clearTimeout(drawTimer)
  drawTimer = setTimeout(() => {
    drawTimer = null
    drawCanvas()
  }, 48)
}

watch(
  () => [formModel.watermarkText, formModel.color, formModel.opacity, formModel.spacing, formModel.fontSize, formModel.angleDeg],
  () => scheduleDraw(),
)

function pickColor(value: WatermarkColor) {
  formModel.color = value
}

function pickAngle(deg: -30 | -45 | -60) {
  formModel.angleDeg = deg
}

function choosePhoto() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const path = res.tempFilePaths[0]
      if (!path)
        return
      uni.getImageInfo({
        src: path,
        success: (info) => {
          imagePath.value = path
          imgW.value = info.width
          imgH.value = info.height
          nextTick(() => measureAndDraw())
        },
        fail: () => {
          uni.showToast({ title: '无法读取图片', icon: 'none' })
        },
      })
    },
  })
}

function measureAndDraw() {
  if (!imagePath.value || !imgW.value || !imgH.value)
    return
  const query = uni.createSelectorQuery()
  query
    .select('.preview-canvas-wrap')
    .boundingClientRect((rect) => {
      if (!rect || !('width' in rect) || rect.width <= 0)
        return
      const maxW = rect.width
      const ratio = imgH.value / imgW.value
      const w = maxW
      const h = maxW * ratio
      canvasW.value = w
      canvasH.value = h
      canvasStyle.value = { width: `${w}px`, height: `${h}px` }
      nextTick(() => drawCanvas())
    })
    .exec()
}

function drawCanvas() {
  if (!imagePath.value || !imgW.value || !imgH.value)
    return

  const ctx = uni.createCanvasContext(canvasId, canvasHost)
  const cw = canvasW.value
  const ch = canvasH.value
  const iw = imgW.value
  const ih = imgH.value

  const scale = Math.min(cw / iw, ch / ih)
  const dw = iw * scale
  const dh = ih * scale
  const ox = (cw - dw) / 2
  const oy = (ch - dh) / 2

  ctx.clearRect(0, 0, cw, ch)
  ctx.drawImage(imagePath.value, ox, oy, dw, dh)

  const text = (formModel.watermarkText || ' ').trim() || ' '
  const fs = Math.max(8, formModel.fontSize)
  const space = Math.max(4, formModel.spacing)

  ctx.save()
  ctx.setGlobalAlpha(Math.min(1, Math.max(0.05, formModel.opacity / 100)))
  ctx.setFillStyle(formModel.color)
  ctx.setFontSize(fs)

  const deg = formModel.angleDeg
  const rad = (deg * Math.PI) / 180
  ctx.translate(cw / 2, ch / 2)
  ctx.rotate(rad)

  let tw = fs * text.length * 0.65
  try {
    const m = ctx.measureText?.(text)
    if (m && typeof m.width === 'number' && m.width > 0)
      tw = m.width + space
  }
  catch {
    tw = fs * text.length * 0.65 + space
  }
  const th = fs + space * 0.45

  const R = Math.sqrt(cw * cw + ch * ch)
  for (let x = -R; x < R; x += tw) {
    for (let y = -R; y < R; y += th)
      ctx.fillText(text, x, y)
  }

  ctx.restore()
  ctx.draw()
}

function saveWatermarked() {
  if (!imagePath.value) {
    uni.showToast({ title: '请先选择照片', icon: 'none' })
    return
  }
  if (saving.value)
    return

  saving.value = true

  nextTick(async () => {
    try {
      await saveCanvasToAlbum({
        canvasId,
        width: canvasW.value,
        height: canvasH.value,
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
  })
}
</script>

<template>
  <view class="page-shell pb-safe">
    <wd-notice-bar
      text="小程序不会存储您的原始照片及水印照片，请放心使用！"
      prefix="notification"
      type="warning"
    />

    <view class="px-32rpx pt-24rpx">
      <view class="preview-canvas-wrap checkerboard relative min-h-360rpx w-full center flex overflow-hidden rounded-16rpx" @click="choosePhoto">
        <canvas
          :id="canvasId"
          :canvas-id="canvasId"
          class="block max-w-full"
          :style="canvasStyle"
        />
        <view v-if="!imagePath" class="pointer-events-none absolute inset-0 center">
          <wd-empty tip="请先选择证件照片" />
        </view>
      </view>
    </view>

    <wd-form
      :model="formModel"
      center
      border
      value-align="right"
      :title-width="100"
      custom-class="card-rounded mx-32rpx mt-32rpx"
    >
      <wd-form-item title="文字" prop="watermarkText">
        <wd-input
          v-model="formModel.watermarkText"
          align-right
          placeholder="输入水印内容"
          custom-class="flex-1"
        />
      </wd-form-item>

      <wd-form-item title="颜色" prop="color">
        <view class="w-full inline-flex flex-nowrap items-center justify-end gap-16rpx">
          <wd-tag
            v-for="c in colors"
            :key="c.value"
            :type="formModel.color === c.value ? 'primary' : 'default'"
            variant="plain"
            round
            @click="pickColor(c.value)"
          >
            {{ c.label }}
          </wd-tag>
        </view>
      </wd-form-item>

      <wd-form-item title="透明度" prop="opacity">
        <wd-slider
          v-model="formModel.opacity"
          :min="8"
          :max="100"
          :step="1"
          active-color="var(--wot-primary-6)"
        />
      </wd-form-item>

      <wd-form-item title="角度" prop="angleDeg">
        <view class="w-full inline-flex flex-nowrap items-center justify-end gap-16rpx">
          <wd-tag
            v-for="a in anglePresets"
            :key="a.deg"
            :type="formModel.angleDeg === a.deg ? 'primary' : 'default'"
            variant="plain"
            round
            @click="pickAngle(a.deg)"
          >
            {{ a.title }}
          </wd-tag>
        </view>
      </wd-form-item>

      <wd-form-item title="间距" prop="spacing">
        <wd-slider
          v-model="formModel.spacing"
          :min="24"
          :max="120"
          :step="1"
          active-color="var(--wot-primary-6)"
        />
      </wd-form-item>

      <wd-form-item title="字体大小" prop="fontSize">
        <wd-slider
          v-model="formModel.fontSize"
          :min="12"
          :max="56"
          :step="1"
          active-color="var(--wot-primary-6)"
        />
      </wd-form-item>
    </wd-form>

    <view class="flex-actions px-32rpx pt-16rpx">
      <wd-button variant="plain" round block custom-class="flex-1" @click="choosePhoto">
        选择照片
      </wd-button>
      <wd-button
        round block
        type="primary"
        :loading="saving"
        custom-class="flex-1"
        @click="saveWatermarked"
      >
        保存水印照片
      </wd-button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.checkerboard {
  background-color: #e8e8e8;
  background-image:
    linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
  background-size: 32rpx 32rpx;
  background-position:
    0 0,
    0 16rpx,
    16rpx -16rpx,
    -16rpx 0;
}
</style>

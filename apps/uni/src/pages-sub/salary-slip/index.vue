<script lang="ts" setup>
import { ref } from 'vue'
import { recognizeSalarySlip } from '@/api/salary-slip'

defineOptions({ name: 'SalarySlipIndex' })

definePage({
  style: {
    navigationBarTitleText: '工资条识别',
  },
})

export interface LineItem {
  key: string
  value: string
  confidence: number
  warning: string
}

const loading = ref(false)
const previewPath = ref('')
const lineItems = ref<LineItem[]>([])
const COMPRESS_THRESHOLD = 2 * 1024 * 1024

function chooseImage() {
  uni.chooseImage({
    count: 1,
    sizeType: ['original', 'compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      let filePath = res.tempFilePaths[0]
      const size = res.tempFiles?.[0]?.size ?? 0
      previewPath.value = filePath

      if (size > COMPRESS_THRESHOLD) {
        try {
          const compressed = await compressImage(filePath)
          filePath = compressed
          previewPath.value = filePath
        }
        catch {
          uni.showToast({ title: '图片压缩失败', icon: 'none' })
          return
        }
      }
    },
  })
}

function compressImage(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.compressImage({
      src,
      quality: 92,
      success: res => resolve(res.tempFilePath),
      fail: reject,
    })
  })
}

async function startRecognize(filePath: string) {
  loading.value = true
  lineItems.value = []
  uni.showLoading({ title: '正在识别工资条…', mask: true })
  try {
    const result = await recognizeSalarySlip(filePath)
    lineItems.value = (result.line_items ?? []).map(item => ({ ...item }))
    if (lineItems.value.length === 0) {
      uni.showToast({ title: '未识别到金额明细', icon: 'none', duration: 2500 })
    }
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : '识别失败，请稍后重试'
    uni.showToast({ title: msg, icon: 'none', duration: 2500 })
  }
  finally {
    loading.value = false
    uni.hideLoading()
  }
}

function parseAmount(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '-')
    return '-'
  const num = Number(trimmed.replace(/,/g, ''))
  if (!Number.isFinite(num))
    return trimmed
  return (Math.round(num * 100) / 100).toFixed(2)
}

function onLineItemInput(index: number, value: string) {
  lineItems.value[index].value = parseAmount(value)
}

function formatAmount(value: string): string {
  return !value || value === '-' ? '' : value
}

function displayLabel(item: LineItem): string {
  return item.key || '未配对金额'
}

function needsReview(item: LineItem): boolean {
  return Boolean(item.warning) || item.confidence < 0.55
}

function confirmResult() {
  uni.showToast({ title: '已确认', icon: 'success' })
}
</script>

<template>
  <view class="page-shell px-24rpx pb-48rpx">
    <view class="mt-24rpx card-rounded bg-white p-32rpx">
      <view class="text-30rpx text-gray-800 font-500">
        拍摄或选择工资条
        <wd-tooltip>
          <wd-icon name="question-circle" size="28rpx" color="#007aff" />
          <template #content>
            <view class="w-500rpx text-26rpx text-gray-500 leading-relaxed">
              <view>请确保文字清晰，角度正常，系统将自动识别工资条全部金额明细，供您核对。</view>
              <view>选图后进行裁切并校正角度再开始识别，可以提高识别准确率。</view>
            </view>
          </template>
        </wd-tooltip>
      </view>

      <view
        v-if="previewPath"
        class="mt-32rpx overflow-hidden border border-gray-100 rounded-16rpx"
      >
        <image :src="previewPath" mode="widthFix" class="w-full" />
      </view>

      <view v-else class="mt-32rpx flex flex-col items-center justify-center rounded-16rpx bg-gray-50 py-80rpx">
        <wd-icon name="camera" size="64rpx" color="#999" />
        <view class="mt-16rpx text-26rpx text-gray-400">
          尚未选择图片
        </view>
      </view>

      <view class="mt-48rpx flex flex-col gap-24rpx">
        <wd-button type="primary" plain block @click="chooseImage">
          {{ previewPath ? '重新选择' : '拍照 / 选图' }}
        </wd-button>
        <wd-button
          v-if="previewPath"
          block
          type="primary"
          :loading="loading"
          @click="startRecognize(previewPath)"
        >
          开始识别
        </wd-button>
      </view>
    </view>

    <view v-if="lineItems.length" class="mt-24rpx card-rounded bg-white p-32rpx">
      <view class="text-30rpx text-gray-800 font-500">
        识别明细（可编辑）
      </view>

      <wd-cell-group custom-class="mt-16rpx">
        <wd-cell
          v-for="(item, index) in lineItems"
          :key="`${item.key}-${index}`"
          :title="displayLabel(item)"
        >
          <view class="flex flex-col items-end gap-8rpx">
            <wd-input
              :model-value="formatAmount(item.value)"
              type="digit"
              placeholder="未识别"
              no-border
              @update:model-value="onLineItemInput(index, $event)"
            />
            <view
              v-if="needsReview(item)"
              class="text-22rpx text-amber-600 leading-snug"
            >
              {{ item.warning || `置信度 ${Math.round(item.confidence * 100)}%，请核对` }}
            </view>
          </view>
        </wd-cell>
      </wd-cell-group>

      <view class="mt-48rpx">
        <wd-button block type="primary" @click="confirmResult">
          确认无误
        </wd-button>
      </view>
    </view>
  </view>
</template>

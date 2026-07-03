<script lang="ts" setup>
import { ref } from 'vue'
import { recognizeSalarySlip } from '@/api/salary-slip'
import { useSalarySlipStore } from '@/store/salarySlip'

defineOptions({ name: 'SalarySlipIndex' })

definePage({
  style: {
    navigationBarTitleText: '工资条识别',
  },
})

const loading = ref(false)
const previewPath = ref('')
const salarySlipStore = useSalarySlipStore()

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

      await startRecognize(filePath)
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
  uni.showLoading({ title: '正在识别工资条…', mask: true })
  try {
    const result = await recognizeSalarySlip(filePath)
    salarySlipStore.setResult(result)
    uni.navigateTo({ url: '/pages-sub/salary-slip/result' })
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
</script>

<template>
  <view class="page-shell px-24rpx pb-48rpx">
    <view class="mt-24rpx card-rounded bg-white p-32rpx">
      <view class="text-30rpx text-gray-800 font-500">
        拍摄或选择工资条
      </view>
      <view class="mt-12rpx text-26rpx text-gray-500 leading-relaxed">
        请确保文字清晰、光线充足。系统将自动识别姓名、应发/实发工资等关键字段，供您核对。
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

      <view class="mt-48rpx">
        <wd-button block type="primary" :loading="loading" @click="chooseImage">
          {{ previewPath ? '重新选择并识别' : '拍照 / 选图识别' }}
        </wd-button>
      </view>
    </view>
  </view>
</template>

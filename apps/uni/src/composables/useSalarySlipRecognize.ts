import type { LineItem } from '@/types/salary-slip'
import { ref } from 'vue'
import { recognizeSalarySlip } from '@/api/salary-slip'

const COMPRESS_THRESHOLD = 2 * 1024 * 1024

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

export function useSalarySlipRecognize() {
  const loading = ref(false)
  const previewPath = ref('')
  const lineItems = ref<LineItem[]>([])

  function chooseImage() {
    uni.chooseImage({
      count: 1,
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        let filePath = res.tempFilePaths[0]
        const size = res.tempFiles?.[0]?.size ?? 0
        previewPath.value = filePath
        lineItems.value = []

        if (size > COMPRESS_THRESHOLD) {
          try {
            filePath = await compressImage(filePath)
            previewPath.value = filePath
          }
          catch {
            uni.showToast({ title: '图片压缩失败', icon: 'none' })
          }
        }
      },
    })
  }

  async function recognize() {
    if (!previewPath.value)
      return
    loading.value = true
    lineItems.value = []
    uni.showLoading({ title: '正在识别工资条…', mask: true })
    try {
      const result = await recognizeSalarySlip(previewPath.value)
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

  return {
    loading,
    previewPath,
    lineItems,
    chooseImage,
    recognize,
  }
}

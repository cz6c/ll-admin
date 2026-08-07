/**
 * 工资条拍照识别 Composable
 * 流程：选图 → 超 2MB 压缩 → 一律上传 recognize → 写入 lineItems / hints
 * 副作用：失败 / 无明细 toast；有 hints 时不 toast（页面常驻条承载）；loading 由页面 SalaryAbacusLoading 消费
 */
import type { LineItem, RecognizeHint } from '@/types/salary-slip'
import { ref } from 'vue'
import { recognizeSalarySlip } from '@/api/salary-slip'

/** 超过此大小再压缩，减少上传耗时与超时概率 */
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
  /** 整单提示（倾斜、低置信度等），选图时清空 */
  const recognizeHints = ref<RecognizeHint[]>([])

  /**
   * 相册/相机选一张后一律识别。
   * 为何不按体积跳过 recognize：常见照片不足 2MB 时，旧逻辑只出预览不填表，打断「拍工资条」主路径。
   * 压缩失败仍用原图识别，避免「压失败 = 永不识别」。
   */
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
        recognizeHints.value = []

        if (size > COMPRESS_THRESHOLD) {
          try {
            filePath = await compressImage(filePath)
            previewPath.value = filePath
          }
          catch {
            uni.showToast({ title: '图片压缩失败，将用原图识别', icon: 'none' })
          }
        }

        await recognize()
      },
    })
  }

  /** 对当前 previewPath 发起识别；无图时直接 return */
  async function recognize() {
    if (!previewPath.value)
      return
    loading.value = true
    lineItems.value = []
    recognizeHints.value = []
    try {
      const result = await recognizeSalarySlip(previewPath.value)
      lineItems.value = (result.line_items ?? []).map(item => ({ ...item }))
      recognizeHints.value = (result.hints ?? []).map(hint => ({ ...hint }))

      if (lineItems.value.length === 0) {
        uni.showToast({ title: '未识别到金额明细', icon: 'none', duration: 2500 })
      }
      // 有 hints 时不 toast：常驻提示条已承载详情，叠 toast 会拖慢核对节奏
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : '识别失败，请稍后重试'
      uni.showToast({ title: msg, icon: 'none', duration: 2500 })
    }
    finally {
      loading.value = false
    }
  }

  return {
    loading,
    previewPath,
    lineItems,
    recognizeHints,
    chooseImage,
  }
}

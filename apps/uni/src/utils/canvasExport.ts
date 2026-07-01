import type { ComponentPublicInstance } from 'vue'
import { saveImageToAlbum } from './album'
import { systemInfo } from './systemInfo'

export interface CanvasExportOptions {
  canvasId: string
  width: number
  height: number
  /** 导出分辨率倍数，默认取设备 pixelRatio */
  destScale?: number
  fileType?: 'png' | 'jpg'
  /** 小程序端 canvas API 需传入页面/组件实例 */
  canvasHost?: ComponentPublicInstance
}

function resolveDestScale(destScale?: number): number {
  if (destScale != null)
    return destScale
  console.log('🚀 ~ resolveDestScale ~ systemInfo.pixelRatio:', systemInfo.pixelRatio)
  return systemInfo.pixelRatio || 2
}

/** 将 canvas 导出为临时图片路径 */
export function canvasToTempFile(options: CanvasExportOptions): Promise<string> {
  const {
    canvasId,
    width,
    height,
    destScale,
    fileType,
    canvasHost,
  } = options

  const scale = resolveDestScale(destScale)
  const destWidth = Math.round(width * scale)
  const destHeight = Math.round(height * scale)

  return new Promise((resolve, reject) => {
    const params: UniApp.CanvasToTempFilePathOptions = {
      canvasId,
      width,
      height,
      destWidth,
      destHeight,
      success: res => resolve(res.tempFilePath),
      fail: (err) => {
        uni.showToast({ title: '导出失败', icon: 'none' })
        reject(err)
      },
    }
    if (fileType)
      params.fileType = fileType

    if (canvasHost)
      uni.canvasToTempFilePath(params, canvasHost)
    else
      uni.canvasToTempFilePath(params)
  })
}

/** 导出 canvas 并保存到相册 */
export async function saveCanvasToAlbum(options: CanvasExportOptions): Promise<void> {
  const tempPath = await canvasToTempFile(options)
  await saveImageToAlbum(tempPath)
}

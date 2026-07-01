import type { ComponentPublicInstance } from 'vue'
import UQRCode from 'uqrcodejs'

/** 在 canvas 上绘制二维码 */
export function drawQrCode(
  canvasId: string,
  text: string,
  size = 240,
  canvasHost?: ComponentPublicInstance,
): Promise<void> {
  const qr = new UQRCode()
  qr.data = text
  qr.size = size
  qr.margin = 10
  qr.make()

  const ctx = uni.createCanvasContext(canvasId, canvasHost)
  qr.canvasContext = ctx
  return qr.drawCanvas()
}

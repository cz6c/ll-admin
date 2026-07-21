/**
 * 工资条识别上传 API
 * 使用 uni.uploadFile（非 http 封装），multipart 字段名必须为 file
 */
import type { SalarySlipResult } from '@/types/salary-slip'
import { ResultEnum } from '@/http/tools/enum'

/** 与后端 ResultData 对齐的上传响应体 */
interface ApiResponse<T> {
  code: number
  msg?: string
  data?: T
}

/** 须大于服务端 LLM timeout（180s），留网络余量 */
const RECOGNIZE_TIMEOUT_MS = 200_000

const RECOGNIZE_PATH = '/salary-slip/recognize'

/** uploadFile 的 data 为字符串，需手动 JSON.parse */
function parseUploadResponse<T>(raw: string): ApiResponse<T> {
  return JSON.parse(raw) as ApiResponse<T>
}

/**
 * 上传工资条图片并识别为 line_items
 * @param filePath 本地临时路径（选图/压缩后）
 * @throws 超时、HTTP/业务失败时抛 Error（message 可直接 toast）
 */
export function recognizeSalarySlip(filePath: string): Promise<SalarySlipResult> {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: RECOGNIZE_PATH,
      filePath,
      name: 'file',
      timeout: RECOGNIZE_TIMEOUT_MS,
      success(res) {
        const statusCode = res.statusCode ?? 0
        if (statusCode >= 400) {
          try {
            const body = parseUploadResponse<SalarySlipResult>(String(res.data || '{}'))
            reject(new Error(body.msg || `请求失败 (${statusCode})`))
          }
          catch {
            reject(new Error(`请求失败 (${statusCode})`))
          }
          return
        }

        try {
          const body = parseUploadResponse<SalarySlipResult>(String(res.data))
          const code = body.code
          if (code === ResultEnum.Success200 || code === ResultEnum.Success0) {
            resolve(body.data ?? ({} as SalarySlipResult))
            return
          }
          reject(new Error(body.msg || '识别失败，请稍后重试'))
        }
        catch {
          reject(new Error('响应解析失败'))
        }
      },
      fail(err) {
        const msg = err.errMsg || '上传失败'
        if (/timeout/i.test(msg)) {
          reject(new Error('识别超时，请稍后重试'))
          return
        }
        reject(new Error(msg))
      },
    })
  })
}

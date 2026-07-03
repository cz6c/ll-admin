import type { SalarySlipResult } from '@/store/salarySlip'
import { ResultEnum } from '@/http/tools/enum'

interface ApiResponse<T> {
  code: number
  msg?: string
  data?: T
}

/** 须大于服务端 LLM timeout（180s），留网络余量 */
const RECOGNIZE_TIMEOUT_MS = 200_000

const RECOGNIZE_PATH = '/common/salary-slip/recognize'

function parseUploadResponse<T>(raw: string): ApiResponse<T> {
  return JSON.parse(raw) as ApiResponse<T>
}

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

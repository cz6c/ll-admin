import type { CustomRequestOptions, IResponse } from '@/http/types'
import { useTokenStore } from '@/store/token'
import { isAuthBypass, shouldEnsureSession } from './tools/auth-policy'
import { ResultEnum } from './tools/enum'

interface PendingRetryTask<T = unknown> {
  options: CustomRequestOptions
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: any) => void
}

// 会话恢复状态管理（防止并发 401 时重复登录）
let recoveringSession = false
let taskQueue: PendingRetryTask[] = []

function flushRetryQueue() {
  const queue = taskQueue
  taskQueue = []
  return queue
}

export function http<T>(options: CustomRequestOptions) {
  // 1. 返回 Promise 对象
  return new Promise<T>((resolve, reject) => {
    const executeRequest = () => {
      uni.request({
        ...options,
        dataType: 'json',
        // #ifndef MP-WEIXIN
        responseType: 'json',
        // #endif
        // 响应成功
        success: async (res) => {
          const responseData = res.data as IResponse<T>
          const { code } = responseData

          // 检查是否是401错误（包括HTTP状态码401或业务码401）
          const isTokenExpired = res.statusCode === 401 || code === 401

          if (isTokenExpired) {
            if (options.retryable === false || isAuthBypass(options.url)) {
              return reject(res)
            }
            const retryCount = options._authRetryCount ?? 0
            if (retryCount >= 1) {
              return reject(res)
            }

            const tokenStore = useTokenStore()
            const retryOptions: CustomRequestOptions = {
              ...options,
              _authRetryCount: retryCount + 1,
            }
            taskQueue.push({
              options: retryOptions,
              resolve: value => resolve(value as T),
              reject,
            })

            if (!recoveringSession) {
              recoveringSession = true
              try {
                await tokenStore.refreshToken({ silent: true })
                const queue = flushRetryQueue()
                queue.forEach(task => task.resolve(http(task.options)))
              }
              catch (refreshErr) {
                console.error('401 后刷新 token 失败:', refreshErr)
                await tokenStore.logout()
                if (!options.hideErrorToast) {
                  uni.showToast({
                    title: '请求失败，请稍后重试',
                    icon: 'none',
                  })
                }
                const queue = flushRetryQueue()
                queue.forEach(task => task.reject(refreshErr))
              }
              finally {
                recoveringSession = false
              }
            }

            return
          }

          // 处理其他成功状态（HTTP状态码200-299）
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // 处理业务逻辑错误
            if (code !== ResultEnum.Success0 && code !== ResultEnum.Success200) {
              uni.showToast({
                icon: 'none',
                title: responseData.msg || responseData.message || '请求错误',
              })
              return reject(responseData.data)
            }
            return resolve(responseData.data)
          }

          // 处理其他错误
          !options.hideErrorToast
          && uni.showToast({
            icon: 'none',
            title: (res.data as any).msg || '请求错误',
          })
          reject(res)
        },
        // 响应失败
        fail(err) {
          uni.showToast({
            icon: 'none',
            title: '网络错误，换个网络试试',
          })
          reject(err)
        },
      })
    }

    const tokenStore = useTokenStore()
    if (shouldEnsureSession(options)) {
      tokenStore.ensureSession({ silent: true })
        .catch((error) => {
          console.error('请求前静默鉴权失败:', error)
        })
        .finally(() => {
          executeRequest()
        })
      return
    }

    executeRequest()
  })
}

/**
 * GET 请求
 * @param url 后台地址
 * @param query 请求query参数
 * @param header 请求头，默认为json格式
 * @returns
 */
export function httpGet<T>(url: string, query?: Record<string, any>, header?: Record<string, any>, options?: Partial<CustomRequestOptions>) {
  return http<T>({
    url,
    query,
    method: 'GET',
    header,
    ...options,
  })
}

/**
 * POST 请求
 * @param url 后台地址
 * @param data 请求body参数
 * @param query 请求query参数，post请求也支持query，很多微信接口都需要
 * @param header 请求头，默认为json格式
 * @returns
 */
export function httpPost<T>(url: string, data?: Record<string, any>, query?: Record<string, any>, header?: Record<string, any>, options?: Partial<CustomRequestOptions>) {
  return http<T>({
    url,
    query,
    data,
    method: 'POST',
    header,
    ...options,
  })
}
/**
 * PUT 请求
 */
export function httpPut<T>(url: string, data?: Record<string, any>, query?: Record<string, any>, header?: Record<string, any>, options?: Partial<CustomRequestOptions>) {
  return http<T>({
    url,
    data,
    query,
    method: 'PUT',
    header,
    ...options,
  })
}

/**
 * DELETE 请求（无请求体，仅 query）
 */
export function httpDelete<T>(url: string, query?: Record<string, any>, header?: Record<string, any>, options?: Partial<CustomRequestOptions>) {
  return http<T>({
    url,
    query,
    method: 'DELETE',
    header,
    ...options,
  })
}

// 支持与 axios 类似的API调用
http.get = httpGet
http.post = httpPost
http.put = httpPut
http.delete = httpDelete

// 支持与 alovaJS 类似的API调用
http.Get = httpGet
http.Post = httpPost
http.Put = httpPut
http.Delete = httpDelete

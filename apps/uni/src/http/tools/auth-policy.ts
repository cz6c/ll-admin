import type { CustomRequestOptions } from '@/http/types'

const AUTH_BYPASS_PATHS = [
  '/login',
  '/auth/login',
  '/refreshToken',
  '/auth/wxLogin',
  '/wxLogin',
  '/auth/refreshToken',
  '/auth/logout',
  '/user/getCode',
]

export function isAuthBypass(url: string) {
  return AUTH_BYPASS_PATHS.some(path => url.includes(path))
}

export function shouldEnsureSession(options: CustomRequestOptions) {
  return !options.skipAuthEnsure && !isAuthBypass(options.url)
}

export function shouldInjectAuthHeader(options: CustomRequestOptions) {
  return !options.skipAuthHeader && !isAuthBypass(options.url)
}

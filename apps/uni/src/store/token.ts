import type {
  ILoginForm,
} from '@/api/login'
import type { IAuthLoginRes } from '@/api/types/login'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  login as _login,
  logout as _logout,
  refreshToken as _refreshToken,
  wxLogin as _wxLogin,
  getWxCode,
} from '@/api/login'
import { isSingleTokenRes } from '@/api/types/login'
import { useUserStore } from './user'

interface AuthActionOptions {
  silent?: boolean
  ignoreUserInfoError?: boolean
}

interface EnsureSessionOptions {
  silent?: boolean
}

// 初始化状态（uni 端统一单 token）
const tokenInfoState = {
  token: '',
}

export const useTokenStore = defineStore(
  'token',
  () => {
    // 定义用户信息
    const tokenInfo = ref<IAuthLoginRes>({ ...tokenInfoState })

    // 添加一个时间戳 ref 作为响应式依赖
    const nowTime = ref(Date.now())
    // 防止并发请求时重复触发静默登录/刷新
    let ensuringSessionPromise: Promise<string> | null = null
    /**
     * 更新响应式数据:now
     * 确保isTokenExpired/isRefreshTokenExpired重新计算,而不是用错误过期缓存值
     * 可useTokenStore内部适时调用;也可链式调用:tokenStore.updateNowTime().hasLogin
     * @returns 最新的tokenStore实例
     */
    const updateNowTime = () => {
      nowTime.value = Date.now()
      return useTokenStore()
    }

    // 设置用户信息
    const setTokenInfo = (val: IAuthLoginRes) => {
      updateNowTime()
      tokenInfo.value = val
    }

    /**
     * 判断token是否过期
     */
    const isTokenExpired = computed(() => {
      if (!tokenInfo.value) {
        return true
      }

      return !(isSingleTokenRes(tokenInfo.value) && !!tokenInfo.value.token)
    })

    /**
     * 登录成功后处理逻辑
     * @param tokenInfo 登录返回的token信息
     */
    async function _postLogin(tokenInfo: IAuthLoginRes, options: AuthActionOptions = {}) {
      setTokenInfo(tokenInfo)
      const userStore = useUserStore()
      const internalUserInfoRequestOptions = {
        // 避免 ensureSession -> fetchUserInfo -> ensureSession 递归
        skipAuthEnsure: true,
        hideErrorToast: true,
      } as const
      try {
        await userStore.fetchUserInfo(internalUserInfoRequestOptions)
      }
      catch (error) {
        if (!options.ignoreUserInfoError) {
          throw error
        }
      }
    }

    /**
     * 用户登录
     * 有的时候后端会用一个接口返回token和用户信息，有的时候会分开2个接口，一个获取token，一个获取用户信息
     * （各有利弊，看业务场景和系统复杂度），这里使用2个接口返回的来模拟
     * @param loginForm 登录参数
     * @returns 登录结果
     */
    const login = async (loginForm: ILoginForm, options: AuthActionOptions = {}) => {
      try {
        const res = await _login(loginForm)
        await _postLogin(res, options)
        return res
      }
      catch (error) {
        console.error('登录失败:', error)
        if (!options.silent) {
          uni.showToast({
            title: '登录失败，请重试',
            icon: 'none',
          })
        }
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 微信登录
     * 有的时候后端会用一个接口返回token和用户信息，有的时候会分开2个接口，一个获取token，一个获取用户信息
     * （各有利弊，看业务场景和系统复杂度），这里使用2个接口返回的来模拟
     * @returns 登录结果
     */
    const wxLogin = async (options: AuthActionOptions = {}) => {
      try {
        // 获取微信小程序登录的code
        const loginRes = await getWxCode()
        const wxCode = String(loginRes?.code || '').trim()
        if (!wxCode) {
          throw new Error('获取微信登录凭证失败')
        }
        const res = await _wxLogin({ code: wxCode })
        await _postLogin(res, options)
        return res
      }
      catch (error) {
        console.error('微信登录失败:', error)
        if (!options.silent) {
          uni.showToast({
            title: '微信登录失败，请重试',
            icon: 'none',
          })
        }
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 退出登录 并 删除用户信息
     */
    const logout = async () => {
      try {
        // TODO 实现自己的退出登录逻辑
        await _logout()
      }
      catch (error) {
        console.error('退出登录失败:', error)
      }
      finally {
        updateNowTime()

        // 无论成功失败，都需要清除本地token信息
        // 清除存储的过期时间
        tokenInfo.value = { ...tokenInfoState }
        uni.removeStorageSync('token')
        const userStore = useUserStore()
        userStore.clearUserInfo()
      }
    }

    /**
     * 刷新token
     * @returns 刷新结果
     */
    const refreshToken = async (options: AuthActionOptions = {}) => {
      try {
        const currentToken = isSingleTokenRes(tokenInfo.value) ? String(tokenInfo.value.token || '').trim() : ''
        if (!currentToken) {
          throw new Error('无效的refreshToken')
        }

        const res = await _refreshToken(currentToken)
        setTokenInfo(res)
        return res
      }
      catch (error) {
        console.error('刷新token失败:', error)
        if (!options.silent) {
          uni.showToast({
            title: '会话刷新失败',
            icon: 'none',
          })
        }
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 获取有效的token
     * 注意：在computed中不直接调用异步函数，只做状态判断
     * 实际的刷新操作应由调用方处理
     * 建议这样使用 tokenStore.updateNowTime().validToken
     */
    const getValidToken = computed(() => {
      // token已过期，返回空
      if (isTokenExpired.value) {
        return ''
      }

      return isSingleTokenRes(tokenInfo.value) ? tokenInfo.value.token : ''
    })

    /**
     * 检查是否有登录信息（不考虑token是否过期）
     */
    const hasLoginInfo = computed(() => {
      if (!tokenInfo.value) {
        return false
      }

      return isSingleTokenRes(tokenInfo.value) && !!tokenInfo.value.token
    })

    /**
     * 检查是否已登录且token有效
     * 建议这样使用tokenStore.updateNowTime().hasLogin
     */
    const hasValidLogin = computed(() => {
      return hasLoginInfo.value && !isTokenExpired.value
    })

    /**
     * 尝试获取有效的token，如果过期且可刷新，则刷新token
     * @returns 有效的token或空字符串
     */
    const tryGetValidToken = async (): Promise<string> => {
      updateNowTime()
      return getValidToken.value
    }

    /**
     * 确保会话可用：优先现有 token，最后静默 wxLogin
     */
    const ensureSession = async (options: EnsureSessionOptions = {}): Promise<string> => {
      updateNowTime()
      if (getValidToken.value) {
        return getValidToken.value
      }
      if (ensuringSessionPromise) {
        return ensuringSessionPromise
      }

      ensuringSessionPromise = (async () => {
        await wxLogin({
          silent: options.silent ?? true,
          ignoreUserInfoError: true,
        })
        return getValidToken.value
      })()
        .finally(() => {
          ensuringSessionPromise = null
        })

      return ensuringSessionPromise
    }

    return {
      // 核心API方法
      login,
      wxLogin,
      logout,

      // 认证状态判断（最常用的）
      hasLogin: hasValidLogin,

      // 内部系统使用的方法
      refreshToken,
      tryGetValidToken,
      ensureSession,
      validToken: getValidToken,

      // 调试或特殊场景可能需要直接访问的信息
      tokenInfo,
      setTokenInfo,
      updateNowTime,
    }
  },
  {
    // 添加持久化配置，确保刷新页面后token信息不丢失
    persist: true,
  },
)

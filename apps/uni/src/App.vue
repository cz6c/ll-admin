<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { navigateToInterceptor } from '@/router/interceptor'
import { useTokenStore } from '@/store'
import { captureChannelFromQuery } from '@/utils/channelFrom'

onLaunch((options) => {
  console.log('App.vue onLaunch', options)
  // 扫码/分享冷启动：尽早落 from，避免先进门禁丢渠道
  captureChannelFromQuery(options?.query as Record<string, unknown> | undefined)
})
onShow((options) => {
  console.log('App.vue onShow', options)
  captureChannelFromQuery(options?.query as Record<string, unknown> | undefined)
  const tokenStore = useTokenStore()
  tokenStore.ensureSession({ silent: true }).catch((error) => {
    console.error('App.vue 静默登录失败:', error)
  })

  // 处理直接进入页面路由的情况：如h5直接输入路由、微信小程序分享后进入等
  // https://github.com/unibest-tech/unibest/issues/192
  if (options?.path) {
    navigateToInterceptor.invoke({ url: `/${options.path}`, query: options.query })
  }
  else {
    navigateToInterceptor.invoke({ url: '/' })
  }
})
onHide(() => {
  console.log('App Hide')
})
</script>

<style lang="scss">

</style>

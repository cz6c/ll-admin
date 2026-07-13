import { computed } from 'vue'
import { safeAreaInsets, systemInfo } from '@/utils/systemInfo'

export function usePageHeight() {
  // 手机状态栏高度(刘海屏)
  const tabBarHeight = computed(() => {
    return safeAreaInsets.top
  })

  // 自定义导航栏高度
  const navHeight = computed(() => {
    // #ifdef H5 || APP-PLUS
    return 44
    // #endif
    // #ifndef H5 || APP-PLUS
    return uni.getMenuButtonBoundingClientRect().bottom
    // #endif
  })

  // 页面内容高度
  const pageHeight = computed(() => {
    return systemInfo.windowHeight - navHeight.value - systemInfo.safeAreaInsets.bottom
  })

  return {
    tabBarHeight,
    navHeight,
    pageHeight,
  }
}

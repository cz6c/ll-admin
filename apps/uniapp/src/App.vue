<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { dateUtil, formatToDatetime, formatUtc } from '@llcz/common'
import { usePageAuth } from '@/hooks/usePageAuth'
import 'abortcontroller-polyfill/dist/abortcontroller-polyfill-only'

usePageAuth()

onLaunch(() => {
  console.log('App Launch')
})
onShow(() => {
  console.log('App Show')
  console.log(formatUtc(dateUtil()))
  console.log(formatToDatetime())
})
onHide(() => {
  console.log('App Hide')
})
</script>

<style lang="scss">
button::after {
  border: none;
}

swiper,
scroll-view {
  flex: 1;
  height: 100%;
  overflow: hidden;
}

image {
  width: 100%;
  height: 100%;
  vertical-align: middle;
}

// 单行省略，优先使用 unocss: text-ellipsis
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 两行省略
.ellipsis-2 {
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

// 三行省略
.ellipsis-3 {
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
</style>

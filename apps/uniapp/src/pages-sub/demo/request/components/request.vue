<script lang="ts" setup>
import { getAreaList } from '@/api/login'
import { getEnvBaseUrl } from '@/utils'

const recommendUrl = ref(getEnvBaseUrl())

const initialData = undefined
// 适合少部分全局性的接口————多个页面都需要的请求接口，额外编写一个 Service 层
const { loading, error, data, run } = useRequest(() => getAreaList(), {
  immediate: true,
  initialData,
})

function reset() {
  data.value = initialData
}
</script>

<template>
  <view class="p-6 text-center">
    <!-- #ifdef H5 -->
    <view class="my-2">
      <a class="my-2" :href="recommendUrl" target="_blank">{{
        recommendUrl
      }}</a>
    </view>
    <!-- #endif -->

    <!-- #ifndef H5 -->
    <view class="my-2 text-left text-sm">
      {{ recommendUrl }}
    </view>
    <!-- #endif -->

    <!-- http://localhost:9000/#/pages/index/request -->
    <wd-button class="my-6" @click="run">
      发送请求
    </wd-button>
    <view class="h-16">
      <view v-if="loading">
        loading...
      </view>
      <block v-else>
        <view class="text-xl">
          请求数据如下
        </view>
        <view class="text-green leading-8">
          {{ JSON.stringify(data) }}
        </view>
      </block>
    </view>
    <wd-button type="error" class="my-6" :disabled="!data" @click="reset">
      重置数据
    </wd-button>
  </view>
</template>

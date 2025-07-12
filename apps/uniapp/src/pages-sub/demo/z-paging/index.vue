<route lang="json5" type="page">
{
  layout: 'default',
  style: {
    navigationBarTitleText: 'z-paging示例',
  },
}
</route>

<script setup lang="ts">
import { ref } from 'vue'

const paging = ref(null)
const dataList = ref([])

function getList({ pageNum, pageSize }) {
  return new Promise((resolve, reject) => {
    resolve({
      list: Array.from({ length: pageSize }, (_, i) => ({ name: (pageNum - 1) * pageSize + i + 1 })),
    })
  })
}

function queryList(pageNo?: number, pageSize?: number) {
  // 这里的pageNo和pageSize会自动计算好，直接传给服务器即可
  // 这里的请求只是演示，请替换成自己的项目的网络请求，并在网络请求回调中通过paging.value.complete(请求回来的数组)将请求结果传给z-paging
  getList({
    pageNum: pageNo,
    pageSize,
  })
    .then((res: any) => {
      // 请勿在网络请求回调中给dataList赋值！！只需要调用complete就可以了
      console.log(res)
      paging.value.complete(res.list)
    })
    .catch((res) => {
      // 如果请求失败写paging.value.complete(false)，会自动展示错误页面
      // 注意，每次都需要在catch中写这句话很麻烦，z-paging提供了方案可以全局统一处理
      // 在底层的网络请求抛出异常时，写uni.$emit('z-paging-error-emit');即可
      paging.value.complete(false)
    })
}
</script>

<template>
  <z-paging ref="paging" v-model="dataList" :default-page-size="50" @query="queryList">
    <view v-for="(item, index) in dataList" :key="index" class="item">
      <view class="item-title">
        {{ item.name }}
      </view>
    </view>
  </z-paging>
</template>

<style scoped></style>

<route lang="json5" type="page">
{
  layout: 'default',
  style: {
    navigationBarTitleText: '请求示例',
  },
}
</route>

<script lang="ts" setup>
import RequestComp from './components/request.vue'
import UploadComp from './components/upload.vue'

console.log('about')
</script>

<template>
  <view>
    <RequestComp />
    <UploadComp />
  </view>
</template>

<style lang="scss" scoped>
.test-css {
  // 16rpx=>0.5rem
  padding-bottom: 16rpx;
  // mt-4=>1rem=>16px;
  margin-top: 16px;
  text-align: center;
}
</style>

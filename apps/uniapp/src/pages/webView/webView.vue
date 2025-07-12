<route lang="json5" type="page"></route>

<script lang="ts" setup>
const linkUrl = ref('')
onLoad((query) => {
  linkUrl.value = query.linkUrl
})
</script>

<template>
  <view>
    <web-view :src="linkUrl" />
  </view>
</template>

<style lang="scss"></style>

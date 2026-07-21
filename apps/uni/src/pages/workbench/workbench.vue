<script lang="ts" setup>
defineOptions({ name: 'Workbench' })

definePage({
  style: {
    navigationBarTitleText: '更多实用工具入口',
  },
})

interface ToolEntry {
  title: string
  desc: string
  icon: string
  url: string
}

const tools: ToolEntry[] = [
  {
    title: '年薪测算',
    desc: '薪资测算、明细与历史记录',
    icon: 'company',
    url: '/pages/salary/calc',
  },
  {
    title: '工资条识别与核对',
    desc: '拍照识别工资条并核对关键字段',
    icon: 'find-replace',
    url: '/pages/salary/verify',
  },
  {
    title: 'WiFi小助手',
    desc: '扫码连网、分享 WiFi',
    icon: 'wifi',
    url: '/pages-sub/wifi/index',
  },
  {
    title: '证件照片加水印',
    desc: '为证件照添加防盗用水印',
    icon: 'camera',
    url: '/pages-sub/id-watermark/id-watermark',
  },
  {
    title: '嘌呤含量查询',
    desc: '查询常见食物嘌呤含量与等级',
    icon: 'search',
    url: '/pages-sub/foodPurineInquiry/index',
  },
]

function openTool(url: string) {
  uni.navigateTo({ url })
}
</script>

<template>
  <view class="page-shell">
    <view class="p-32rpx">
      <wd-cell-group center border custom-class="card-rounded" :title-width="260">
        <wd-cell
          v-for="item in tools"
          :key="item.url"
          :title="item.title"
          :label="item.desc"
          :prefix-icon="item.icon"
          is-link
          @click="openTool(item.url)"
        />
      </wd-cell-group>
    </view>
  </view>
</template>

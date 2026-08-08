<script lang="ts" setup>
/**
 * 工作台：生活类实用工具入口
 * 主流程：分组列表进入分包工具；薪资能力在首页，此处不再重复
 */
defineOptions({ name: 'Workbench' })

definePage({
  style: {
    navigationBarTitleText: '实用工具',
  },
})

interface ToolEntry {
  title: string
  desc: string
  /** UnoCSS 图标 class（动态绑定须进 safelist） */
  icon: string
  url: string
}

interface ToolSection {
  title: string
  tools: ToolEntry[]
}

/** 仅保留首页未承载的生活工具；薪资测算/核对已去重 */
const sections: ToolSection[] = [
  {
    title: '生活工具',
    tools: [
      {
        title: 'WiFi 小助手',
        desc: '扫码连网、分享 WiFi',
        icon: 'i-carbon-wifi',
        url: '/pages-sub/wifi/index',
      },
      {
        title: '证件照片加水印',
        desc: '为证件照加防盗用水印',
        icon: 'i-carbon-camera',
        url: '/pages-sub/id-watermark/id-watermark',
      },
      {
        title: '嘌呤含量查询',
        desc: '查常见食物嘌呤等级',
        icon: 'i-carbon-restaurant',
        url: '/pages-sub/foodPurineInquiry/index',
      },
    ],
  },
]

function openTool(url: string) {
  uni.navigateTo({ url })
}
</script>

<template>
  <view class="page-shell">
    <view class="p-32rpx">
      <view
        v-for="section in sections"
        :key="section.title"
        class="tool-section"
      >
        <text class="tool-section__title">
          {{ section.title }}
        </text>
        <wd-cell-group center border custom-class="card-rounded" :title-width="260">
          <wd-cell
            v-for="item in section.tools"
            :key="item.url"
            :title="item.title"
            :label="item.desc"
            is-link
            @click="openTool(item.url)"
          >
            <template #prefix>
              <view class="tool-cell__icon" :class="item.icon" />
            </template>
          </wd-cell>
        </wd-cell-group>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.tool-section + .tool-section {
  margin-top: 32rpx;
}

.tool-section__title {
  display: block;
  margin: 0 8rpx 16rpx;
  font-size: 24rpx;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: #8a9199;
  line-height: 1.3;
}

.tool-cell__icon {
  width: 40rpx;
  height: 40rpx;
  margin-right: 16rpx;
  color: var(--wot-primary-6);
}
</style>

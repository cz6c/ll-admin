<script lang="ts" setup>
/**
 * 薪资历史列表行：首页最近记录与历史页共用
 * 有 icon 时展示左侧色块图标；无 icon 时用色点区分类型（兼容旧用法）
 */
import type { SalaryHistoryEntryTheme } from '@/utils/salaryHistoryEntry'
import { computed } from 'vue'

defineOptions({ name: 'SalaryHistoryEntryRow' })

const props = withDefaults(defineProps<{
  /** 主标题 */
  title: string
  /** 副标题（类型 · 日期） */
  subtitle: string
  /** blue=测算主色，green=核对成功色 */
  theme?: SalaryHistoryEntryTheme
  /** wot-ui 图标名；不传或空串则不渲染左侧图标区，改用色点 */
  icon?: string
  /** 是否显示底部分割线（列表非末项） */
  bordered?: boolean
}>(), {
  theme: 'blue',
  icon: '',
  bordered: false,
})

defineEmits<{
  click: []
}>()

const isGreen = computed(() => props.theme === 'green')

/** 未显式传 icon 时按主题给默认图标，避免调用方漏传 */
const resolvedIcon = computed(() => {
  if (props.icon)
    return props.icon
  return isGreen.value ? 'check-square' : 'file'
})

const iconColor = computed(() => {
  return isGreen.value ? 'var(--wot-success-main)' : 'var(--wot-primary-6)'
})
</script>

<template>
  <view
    class="flex items-center gap-20rpx px-28rpx py-24rpx"
    :class="{ 'border-b border-#edf0f6': bordered }"
    @click="$emit('click')"
  >
    <view
      v-if="icon"
      class="entry-icon shrink-0"
      :class="isGreen ? 'entry-icon--green' : 'entry-icon--blue'"
    >
      <wd-icon :name="resolvedIcon" size="36rpx" :color="iconColor" />
    </view>

    <view class="min-w-0 flex-1">
      <view class="truncate text-30rpx font-medium">
        {{ title }}
      </view>
      <view class="mt-10rpx flex items-center gap-10rpx">
        <view
          v-if="!icon"
          class="h-12rpx w-12rpx rounded-full"
          :class="isGreen ? 'bg-[var(--wot-success-main)]' : 'bg-primary'"
        />
        <view class="text-24rpx text-#666">
          {{ subtitle }}
        </view>
      </view>
    </view>

    <wd-icon name="right" size="28rpx" color="#999" />
  </view>
</template>

<style scoped lang="scss">
.entry-icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.entry-icon--blue {
  background: var(--wot-primary-1);
}

.entry-icon--green {
  background: var(--wot-success-surface);
}
</style>

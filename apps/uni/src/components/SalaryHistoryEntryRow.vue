<script lang="ts" setup>
/**
 * 薪资历史卡片行：历史列表单条扫读卡
 * 布局：类型胶囊 + 主文/日期 + 右侧强调；整卡可点，无箭头第二入口
 * 适用：salary/history 独立卡片列表
 */
import type {
  SalaryHistoryEmphasisTone,
  SalaryHistoryEntryKind,
} from '@/utils/salaryHistoryEntry'
import { computed } from 'vue'

defineOptions({ name: 'SalaryHistoryEntryRow' })

const props = withDefaults(defineProps<{
  /** 主标题 */
  title: string
  /** 副标题（更新日期） */
  subtitle: string
  /** 业务类型，驱动左侧胶囊 */
  kind: SalaryHistoryEntryKind
  /** 右侧强调文案 */
  emphasis: string
  /** 右侧强调色调 */
  emphasisTone?: SalaryHistoryEmphasisTone
}>(), {
  emphasisTone: 'primary',
})

defineEmits<{
  click: []
}>()

const kindLabel = computed(() => (props.kind === 'verify' ? '核对' : '测算'))

const isVerify = computed(() => props.kind === 'verify')

const emphasisClass = computed(() => {
  if (props.emphasisTone === 'success')
    return 'history-entry-row__emphasis--success'
  if (props.emphasisTone === 'warning')
    return 'history-entry-row__emphasis--warning'
  return 'history-entry-row__emphasis--primary'
})
</script>

<template>
  <view
    class="history-entry-row"
    hover-class="history-entry-row--pressed"
    :hover-stay-time="70"
    @click="$emit('click')"
  >
    <view
      class="history-entry-row__badge"
      :class="isVerify ? 'history-entry-row__badge--verify' : 'history-entry-row__badge--calc'"
    >
      {{ kindLabel }}
    </view>

    <view class="history-entry-row__body">
      <view class="history-entry-row__title">
        {{ title }}
      </view>
      <view class="history-entry-row__subtitle">
        {{ subtitle }}
      </view>
    </view>

    <view
      class="history-entry-row__emphasis"
      :class="emphasisClass"
    >
      {{ emphasis }}
    </view>
  </view>
</template>

<style scoped lang="scss">
/* 白卡内容区：分隔靠外层卡片间距，不用行内发丝线 */
.history-entry-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 28rpx 24rpx;
  background: #fff;
  border-radius: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(31, 35, 41, 0.03);
  transition: transform 120ms var(--ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.history-entry-row--pressed {
  transform: scale(0.985);
  opacity: 0.94;
}

.history-entry-row__badge {
  flex-shrink: 0;
  min-width: 64rpx;
  padding: 6rpx 12rpx;
  border-radius: 10rpx;
  font-size: 22rpx;
  line-height: 1.2;
  text-align: center;
  letter-spacing: 0.01em;
}

.history-entry-row__badge--calc {
  color: var(--wot-primary-6);
  background: var(--wot-primary-1);
}

.history-entry-row__badge--verify {
  color: var(--wot-success-main);
  background: var(--wot-success-surface);
}

.history-entry-row__body {
  min-width: 0;
  flex: 1;
}

.history-entry-row__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 30rpx;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: #1f2329;
  line-height: 1.35;
}

.history-entry-row__subtitle {
  margin-top: 8rpx;
  font-size: 22rpx;
  letter-spacing: 0.01em;
  color: #8a9199;
  line-height: 1.3;
}

.history-entry-row__emphasis {
  flex-shrink: 0;
  max-width: 220rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 28rpx;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
  text-align: right;
}

.history-entry-row__emphasis--primary {
  color: var(--wot-primary-6);
}

.history-entry-row__emphasis--success {
  color: var(--wot-success-main);
}

.history-entry-row__emphasis--warning {
  color: var(--wot-warning-main);
}
</style>

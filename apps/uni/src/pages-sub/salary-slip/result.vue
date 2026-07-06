<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { computed, onMounted, reactive } from 'vue'
import { useSalarySlipStore } from '@/store/salarySlip'

defineOptions({ name: 'SalarySlipResult' })

definePage({
  style: {
    navigationBarTitleText: '核对工资条',
  },
})

const salarySlipStore = useSalarySlipStore()
const { hasResult } = storeToRefs(salarySlipStore)

const lineItems = reactive<Record<string, number | null>>({})
const warnings = computed(() => salarySlipStore.result.warnings ?? [])

onMounted(() => {
  if (!hasResult.value) {
    uni.showToast({ title: '暂无识别结果', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 1500)
    return
  }
  Object.assign(lineItems, salarySlipStore.result.line_items ?? {})
})

function parseAmount(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed)
    return null
  const num = Number(trimmed.replace(/,/g, ''))
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null
}

function onLineItemInput(label: string, value: string) {
  lineItems[label] = parseAmount(value)
}

function formatAmount(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

const lineItemLabels = computed(() => Object.keys(lineItems))

function confirmResult() {
  salarySlipStore.setResult({
    line_items: { ...lineItems },
    warnings: salarySlipStore.result.warnings,
    confidence: salarySlipStore.result.confidence,
  })
  uni.showToast({ title: '已确认', icon: 'success' })
}

function goBack() {
  uni.navigateBack()
}
</script>

<template>
  <view class="page-shell px-24rpx pb-48rpx">
    <view
      v-if="warnings.length"
      class="mt-24rpx card-rounded bg-amber-50 p-24rpx"
    >
      <view class="text-28rpx text-amber-800 font-500">
        识别提示
      </view>
      <view
        v-for="(msg, idx) in warnings"
        :key="idx"
        class="mt-8rpx text-26rpx text-amber-700 leading-relaxed"
      >
        · {{ msg }}
      </view>
    </view>

    <wd-cell-group
      v-if="lineItemLabels.length"
      custom-class="card-rounded mt-24rpx"
      title="识别明细（可编辑）"
    >
      <wd-cell
        v-for="label in lineItemLabels"
        :key="label"
        :title="label"
      >
        <wd-input
          :model-value="formatAmount(lineItems[label])"
          type="digit"
          placeholder="未识别"
          no-border
          @update:model-value="onLineItemInput(label, $event)"
        />
      </wd-cell>
    </wd-cell-group>

    <view
      v-else
      class="mt-48rpx text-center text-26rpx text-gray-400"
    >
      未识别到金额明细
    </view>

    <view class="mt-48rpx flex flex-col gap-24rpx">
      <wd-button block type="primary" @click="confirmResult">
        确认无误
      </wd-button>
      <wd-button plain block @click="goBack">
        重新识别
      </wd-button>
    </view>
  </view>
</template>

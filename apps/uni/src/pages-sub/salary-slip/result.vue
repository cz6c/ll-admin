<script lang="ts" setup>
import type { SalarySlipResult } from '@/store/salarySlip'
import { storeToRefs } from 'pinia'
import { computed, onMounted, reactive, ref } from 'vue'
import { useSalarySlipStore } from '@/store/salarySlip'

defineOptions({ name: 'SalarySlipResult' })

definePage({
  style: {
    navigationBarTitleText: '核对工资条',
  },
})

const salarySlipStore = useSalarySlipStore()
const { hasResult } = storeToRefs(salarySlipStore)

const form = reactive<SalarySlipResult>({
  name: null,
  fixed_salary: null,
  welfare_bonus: null,
  gross_pay: null,
  total_deductions: null,
  net_pay: null,
  pay_date: null,
})

const serverWarnings = ref<string[]>([])
const lineItemsExpanded = ref(false)

const lineItemEntries = computed(() => {
  const items = form.line_items || {}
  return Object.entries(items).filter(([, value]) => value !== null && value !== undefined)
})

const confidenceLabel = computed(() => {
  switch (form.confidence) {
    case 'high': return '置信度：高'
    case 'medium': return '置信度：中，建议核对'
    case 'low': return '置信度：低，请重点核对'
    default: return ''
  }
})

onMounted(() => {
  if (!hasResult.value) {
    uni.showToast({ title: '暂无识别结果', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 1500)
    return
  }
  Object.assign(form, salarySlipStore.result)
  serverWarnings.value = salarySlipStore.result.warnings ?? []
})

function parseAmount(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed)
    return null
  const num = Number(trimmed.replace(/,/g, ''))
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null
}

function onAmountInput(field: keyof SalarySlipResult, value: string) {
  if (field === 'name' || field === 'pay_date') {
    form[field] = value.trim() || null
    return
  }
  if (field === 'line_items' || field === 'warnings' || field === 'template_id' || field === 'confidence') {
    return
  }
  form[field] = parseAmount(value)
}

function formatAmount(value: number | null): string {
  return value === null || value === undefined ? '' : String(value)
}

const grossMismatch = computed(() => {
  const { fixed_salary, welfare_bonus, gross_pay } = form
  if (fixed_salary === null || welfare_bonus === null || gross_pay === null)
    return false
  return Math.abs(gross_pay - (fixed_salary + welfare_bonus)) > 0.01
})

const netMismatch = computed(() => {
  const { gross_pay, total_deductions, net_pay } = form
  if (gross_pay === null || total_deductions === null || net_pay === null)
    return false
  return Math.abs(net_pay - (gross_pay - total_deductions)) > 0.01
})

const localWarnings = computed(() => {
  const list: string[] = [...serverWarnings.value]
  if (grossMismatch.value && !list.some(w => w.includes('固定薪资')))
    list.push('应发工资与「固定薪资 + 福利奖金」之和不一致，请核对')
  if (netMismatch.value && !list.some(w => w.includes('扣款总额')))
    list.push('实发工资与「应发工资 - 扣款总额」之和不一致，请核对')
  return list
})

const hasWarning = computed(() => localWarnings.value.length > 0)

function confirmResult() {
  salarySlipStore.setResult({ ...form })
  uni.showToast({ title: '已确认', icon: 'success' })
}
function goBack() {
  uni.navigateBack()
}
</script>

<template>
  <view class="page-shell px-24rpx pb-48rpx">
    <view
      v-if="confidenceLabel"
      class="mt-24rpx text-24rpx text-gray-500"
    >
      {{ confidenceLabel }}
    </view>

    <view
      v-if="hasWarning"
      class="mt-16rpx rounded-12rpx bg-amber-50 px-24rpx py-20rpx text-26rpx text-amber-700 leading-relaxed"
    >
      <view
        v-for="(warning, index) in localWarnings"
        :key="index"
        :class="{ 'mt-8rpx': index > 0 }"
      >
        {{ warning }}
      </view>
    </view>

    <wd-cell-group custom-class="card-rounded mt-24rpx" title="识别结果（可编辑）">
      <wd-cell title="员工姓名">
        <wd-input
          :model-value="form.name ?? ''"
          placeholder="未识别"
          no-border
          @update:model-value="onAmountInput('name', $event)"
        />
      </wd-cell>
      <wd-cell title="固定薪资">
        <wd-input
          :model-value="formatAmount(form.fixed_salary)"
          type="digit"
          placeholder="未识别"
          no-border
          @update:model-value="onAmountInput('fixed_salary', $event)"
        />
      </wd-cell>
      <wd-cell title="福利奖金">
        <wd-input
          :model-value="formatAmount(form.welfare_bonus)"
          type="digit"
          placeholder="未识别"
          no-border
          @update:model-value="onAmountInput('welfare_bonus', $event)"
        />
      </wd-cell>
      <wd-cell title="应发工资">
        <wd-input
          :model-value="formatAmount(form.gross_pay)"
          type="digit"
          placeholder="未识别"
          no-border
          @update:model-value="onAmountInput('gross_pay', $event)"
        />
      </wd-cell>
      <wd-cell title="扣款总额">
        <wd-input
          :model-value="formatAmount(form.total_deductions)"
          type="digit"
          placeholder="未识别"
          no-border
          @update:model-value="onAmountInput('total_deductions', $event)"
        />
      </wd-cell>
      <wd-cell title="实发工资">
        <wd-input
          :model-value="formatAmount(form.net_pay)"
          type="digit"
          placeholder="未识别"
          no-border
          @update:model-value="onAmountInput('net_pay', $event)"
        />
      </wd-cell>
      <wd-cell title="发薪日期">
        <wd-input
          :model-value="form.pay_date ?? ''"
          placeholder="YYYY-MM-DD"
          no-border
          @update:model-value="onAmountInput('pay_date', $event)"
        />
      </wd-cell>
    </wd-cell-group>

    <wd-cell-group
      v-if="lineItemEntries.length"
      custom-class="card-rounded mt-24rpx"
      :title="lineItemsExpanded ? '识别明细' : '识别明细（点击展开）'"
      @click="lineItemsExpanded = !lineItemsExpanded"
    >
      <template v-if="lineItemsExpanded">
        <wd-cell
          v-for="[label, amount] in lineItemEntries"
          :key="label"
          :title="label"
          :value="formatAmount(amount)"
        />
      </template>
      <wd-cell
        v-else
        title="共识别明细项"
        :value="`${lineItemEntries.length} 项`"
      />
    </wd-cell-group>

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

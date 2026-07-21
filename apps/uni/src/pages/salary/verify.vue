<script lang="ts" setup>
/**
 * 月薪核对页
 * 主流程：选图识别 → 映射 6 字段（可手动改）→ 选所属月 → 累计预扣核对 → 写入历史
 * 必填：税前、个税、税后；社保/公积金/专项可 0
 */
import type { LineItem } from '@/types/salary-slip'
import type { PayslipVerifyResult } from '@/utils/salaryCalculator'
import type { PayslipFieldKey, PayslipMappedFields } from '@/utils/salarySlipFieldMap'
import dayjs from 'dayjs'
import { computed, ref, watch } from 'vue'
import { useSalarySlipRecognize } from '@/composables/useSalarySlipRecognize'
import { useSalaryVerifyHistoryStore } from '@/store/salaryVerifyHistory'
import { formatSalaryAmount } from '@/utils/formatSalaryAmount'
import {
  formatPayPeriod,
  formatPayPeriodLabel,
  parsePayPeriod,
  payPeriodToTimestamp,
  previousPayPeriod,
} from '@/utils/payPeriod'
import { computeVerifyForRecord, formatVerifyAbnormalSummary } from '@/utils/payslipVerify'
import { mapLineItemsToPayslipFields, PAYSLIP_FIELD_LABELS } from '@/utils/salarySlipFieldMap'

defineOptions({ name: 'SalaryVerify' })

definePage({
  style: {
    navigationBarTitleText: '月薪核对',
  },
})

const showDialog = ref(false)
const popupZIndex = 1100
const verifyHistoryStore = useSalaryVerifyHistoryStore()
const { loading, previewPath, lineItems, chooseImage, recognize } = useSalarySlipRecognize()

const calendarMinDate = dayjs('2020-01-01').valueOf()
const calendarMaxDate = dayjs().add(1, 'year').endOf('year').valueOf()

const showPayPeriodCalendar = ref(false)
const showFieldAssignPicker = ref(false)
const showUnmapped = ref(false)
const payPeriod = ref(previousPayPeriod())
const payPeriodTs = ref(payPeriodToTimestamp(previousPayPeriod()))
const verifyResult = ref<PayslipVerifyResult | null>(null)
const pendingAssignItem = ref<LineItem | null>(null)

const form = ref<PayslipMappedFields>({
  preTaxMonthly: 0,
  ssPersonalAmount: 0,
  hfPersonalAmount: 0,
  specialDeductionMonthly: 0,
  personalIncomeTax: 0,
  postTaxMonthly: 0,
})

const unmappedItems = ref<LineItem[]>([])

/** 恒为 true：允许无 OCR 结果时也手工填表核对；勿改成 > 0 否则无法纯手填 */
const showVerifyForm = computed(() => lineItems.value.length >= 0)

const payPeriodLabel = computed(() => formatPayPeriodLabel(payPeriod.value))

const fieldKeys: PayslipFieldKey[] = [
  'preTaxMonthly',
  'ssPersonalAmount',
  'hfPersonalAmount',
  'specialDeductionMonthly',
  'personalIncomeTax',
  'postTaxMonthly',
]

const FIELD_ASSIGN_OPTIONS = fieldKeys.map(key => ({
  label: PAYSLIP_FIELD_LABELS[key],
  value: key,
}))

const fieldAssignTitle = computed(() => {
  const item = pendingAssignItem.value
  if (!item)
    return '引用到字段'
  const label = displayUnmappedLabel(item)
  const val = item.value && item.value !== '-' ? item.value : '—'
  return `「${label}」${val} 引用到`
})

const calcModeHint = computed(() => {
  const r = verifyResult.value
  if (!r)
    return ''
  if (r.calcMode === 'history') {
    const { month } = parsePayPeriod(payPeriod.value)
    return `已基于 ${month - 1} 个月历史记录累计计算（${payPeriodLabel.value}）。`
  }
  if (r.missingPriorMonths?.length) {
    const months = r.missingPriorMonths.map(m => `${m}月`).join('、')
    return `缺少 ${months} 核对记录，暂按本月工资推算前序月份，结果仅供参考；补全后更准确`
  }
  return `暂无完整历史，按本月工资估算累计个税（${payPeriodLabel.value}），结果仅供参考`
})

const abnormalSummary = computed(() => {
  const r = verifyResult.value
  return r ? formatVerifyAbnormalSummary(r) : ''
})

watch(lineItems, (items) => {
  if (!items.length)
    return
  const mapped = mapLineItemsToPayslipFields(items)
  form.value = { ...mapped.fields }
  unmappedItems.value = mapped.unmappedItems
  verifyResult.value = null
})

function parseNum(val: string | number) {
  const s = String(val ?? '').replace(/[^\d.]/g, '')
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function onFieldInput(key: PayslipFieldKey, val: string | number) {
  form.value[key] = parseNum(val)
  verifyResult.value = null
}

function fieldDisplayValue(key: PayslipFieldKey): string {
  const v = form.value[key]
  return v > 0 ? String(v) : ''
}

function onPayPeriodConfirm({ value }: { value: number }) {
  payPeriodTs.value = value
  payPeriod.value = formatPayPeriod(value)
  verifyResult.value = null
}

function fmt(n: number) {
  return formatSalaryAmount(n)
}

async function submitVerify() {
  const required: PayslipFieldKey[] = ['preTaxMonthly', 'personalIncomeTax', 'postTaxMonthly']
  const missing = required.filter(key => !(form.value[key] > 0))
  if (missing.length) {
    const labels = missing.map(key => PAYSLIP_FIELD_LABELS[key]).join('、')
    uni.showToast({ title: `请填写${labels}`, icon: 'none' })
    return
  }

  try {
    const record = await verifyHistoryStore.upsertByPayPeriod({
      payPeriod: payPeriod.value,
      preTaxMonthly: form.value.preTaxMonthly,
      ssPersonalAmount: form.value.ssPersonalAmount,
      hfPersonalAmount: form.value.hfPersonalAmount,
      specialDeductionMonthly: form.value.specialDeductionMonthly,
      personalIncomeTax: form.value.personalIncomeTax,
      postTaxMonthly: form.value.postTaxMonthly,
    })
    verifyResult.value = computeVerifyForRecord(record, verifyHistoryStore.items)
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : '核对记录保存失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
}

function displayUnmappedLabel(item: LineItem): string {
  return item.key || '未配对金额'
}

function openFieldAssign(item: LineItem) {
  const amount = parseNum(item.value)
  if (amount <= 0 && String(item.value ?? '').replace(/[^\d.]/g, '') === '') {
    uni.showToast({ title: '该条无有效金额', icon: 'none' })
    return
  }
  pendingAssignItem.value = item
  showFieldAssignPicker.value = true
}

function onFieldAssignConfirm({ value }: { value: (string | number)[] }) {
  const item = pendingAssignItem.value
  const key = value[0] as PayslipFieldKey
  if (!item || !key)
    return
  form.value[key] = parseNum(item.value)
  verifyResult.value = null
  pendingAssignItem.value = null
  uni.showToast({
    title: `已填入${PAYSLIP_FIELD_LABELS[key]}`,
    icon: 'success',
  })
}

function goVerifyHistory() {
  uni.navigateTo({ url: '/pages/salary/history?tab=verify' })
}
</script>

<template>
  <view class="page-shell pb-safe">
    <view class="p-24rpx">
      <!-- A. 识别区 -->
      <view class="mb-24rpx card-rounded bg-white p-32rpx">
        <view class="flex items-center justify-between">
          <view class="text-30rpx text-#333 font-500">
            <text class="mr-8rpx">工资条识别</text>
            <wd-icon name="question-circle" size="28rpx" class="text-primary" @click="showDialog = true" />
            <wd-popup v-model="showDialog" custom-class="rounded-24rpx" :close-on-click-modal="false">
              <view class="w-520rpx rounded-24rpx bg-white p-40rpx">
                <scroll-view scroll-y class="max-h-520rpx">
                  <view class="whitespace-pre-wrap text-26rpx text-#666 leading-relaxed">
                    <view>1.请确保文字清晰，角度正常，系统将自动识别工资条全部金额明细。</view>
                    <view>2.识别后会自动填入核对表单中，您可修改确认无误后再提交核对。</view>
                  </view>
                </scroll-view>
                <view class="mt-32rpx flex gap-24rpx">
                  <wd-button type="primary" block :round="true" @click="showDialog = false">
                    知道了
                  </wd-button>
                </view>
              </view>
            </wd-popup>
          </view>
          <wd-text type="primary" text="核对历史" @click="goVerifyHistory" />
        </view>

        <view class="mt-32rpx" @click="chooseImage">
          <wd-img v-if="previewPath" width="100%" :src="previewPath" :enable-preview="true" mode="widthFix" radius="8rpx" />
          <view v-else class="flex flex-col items-center justify-center rounded-16rpx bg-#fafafa py-60rpx">
            <wd-icon name="camera" size="64rpx" color="#999" />
            <view class="mt-16rpx text-26rpx text-#999">
              点击选择图片
            </view>
          </view>
        </view>

        <wd-button
          v-if="previewPath"
          type="primary"
          block
          :round="true"
          custom-class="mt-32rpx"
          :loading="loading"
          @click="recognize"
        >
          开始识别
        </wd-button>

        <view v-if="showVerifyForm && unmappedItems.length" class="pt-32rpx">
          <view
            class="flex items-center justify-between py-16rpx text-26rpx text-#666"
            @click="showUnmapped = !showUnmapped"
          >
            <text>识别明细（{{ unmappedItems.length }} 项）</text>
            <wd-icon :name="showUnmapped ? 'arrow-up' : 'arrow-down'" size="28rpx" />
          </view>
          <view v-if="showUnmapped" class="rounded-12rpx bg-#fafafa px-24rpx py-16rpx">
            <view
              v-for="(item, index) in unmappedItems"
              :key="`${item.key}-${index}`"
              class="unmapped-row flex items-center justify-between gap-16rpx py-16rpx"
            >
              <view class="min-w-0 flex-1">
                <text class="block text-26rpx text-#666">
                  {{ displayUnmappedLabel(item) }}
                </text>
                <text class="mt-4rpx block text-28rpx text-#333 tabular-nums">
                  {{ item.value }}
                </text>
              </view>
              <wd-button
                type="primary"
                variant="text"
                size="small"
                custom-class="shrink-0"
                @click="openFieldAssign(item)"
              >
                快速引用
              </wd-button>
            </view>
          </view>
        </view>
      </view>

      <!-- B. 核对表单 -->
      <view v-if="showVerifyForm" class="card-rounded bg-white p-32rpx">
        <view class="text-30rpx text-#333 font-500">
          核对信息（可编辑）
        </view>
        <wd-form :model="form" center value-align="right" :title-width="120" custom-class="salary-form mt-32rpx">
          <wd-cell-group center border>
            <wd-form-item
              title="工资月份"
              is-link
              :value="payPeriodLabel"
              @click="showPayPeriodCalendar = true"
            />
            <wd-form-item
              v-for="key in fieldKeys"
              :key="key"
              :title="PAYSLIP_FIELD_LABELS[key]"
              :prop="key"
            >
              <wd-input
                type="digit"
                align-right
                :model-value="fieldDisplayValue(key)"
                placeholder="0"
                custom-class="salary-cell-input"
                @update:model-value="onFieldInput(key, $event)"
              />
            </wd-form-item>
          </wd-cell-group>
        </wd-form>

        <view class="mt-32rpx flex gap-24rpx">
          <wd-button
            type="primary"
            variant="plain"
            block
            :round="true"
            @click="goVerifyHistory"
          >
            核对历史
          </wd-button>
          <wd-button
            type="primary"
            block
            :round="true"
            @click="submitVerify"
          >
            开始核对
          </wd-button>
        </view>

        <!-- C. 核对结果 -->
        <view v-if="verifyResult" class="pt-32rpx">
          <view
            v-if="verifyResult.overallMatch"
            class="verify-result verify-result--ok"
          >
            <text class="verify-result__title">
              ✅ 核对无误
            </text>
            <text class="verify-result__desc">
              1.个税与系统累计预扣法计算结果一致；
            </text>
            <text class="verify-result__desc">
              2.税后工资 = 税前 − 个人社保 − 个人公积金 − 个税，加减。
            </text>
            <text v-if="calcModeHint" class="verify-result__mode mt-12rpx">
              {{ calcModeHint }}
            </text>
          </view>
          <view
            v-else
            class="verify-result verify-result--warn"
          >
            <text class="verify-result__title">
              ⚠️ 发现差异
            </text>
            <text v-if="calcModeHint" class="verify-result__mode mt-12rpx">
              {{ calcModeHint }}
            </text>
            <view v-if="!verifyResult.taxMatch" class="verify-detail mt-24rpx">
              <view class="mb-16rpx text-26rpx text-#666">
                个税核对
              </view>
              <view class="verify-detail__row">
                <text class="verify-detail__label">
                  系统应扣个税
                </text>
                <text class="verify-detail__val tabular-nums">
                  ¥{{ fmt(verifyResult.expectedTax) }}
                </text>
              </view>
              <view class="verify-detail__row">
                <text class="verify-detail__label">
                  工资条个税
                </text>
                <text class="verify-detail__val tabular-nums">
                  ¥{{ fmt(form.personalIncomeTax) }}
                </text>
              </view>
              <view class="verify-detail__row verify-detail__row--highlight">
                <text class="verify-detail__label">
                  差异
                </text>
                <text class="verify-detail__val tabular-nums">
                  {{ verifyResult.taxDiff > 0 ? '+' : '' }}{{ fmt(verifyResult.taxDiff) }}
                </text>
              </view>
              <view v-if="abnormalSummary" class="verify-detail__hint mt-16rpx">
                {{ abnormalSummary }}
              </view>
            </view>
            <view
              v-if="!verifyResult.postTaxMatch"
              class="verify-detail mt-24rpx"
              :class="{ 'border-t border-#f0e6c8 pt-24rpx': !verifyResult.taxMatch }"
            >
              <view class="mb-16rpx text-26rpx text-#666">
                税后月薪核对
              </view>
              <view class="verify-detail__row">
                <text class="verify-detail__label">
                  系统应发税后
                </text>
                <text class="verify-detail__val tabular-nums">
                  ¥{{ fmt(verifyResult.expectedPostTax) }}
                </text>
              </view>
              <view class="verify-detail__row">
                <text class="verify-detail__label">
                  工资条税后工资
                </text>
                <text class="verify-detail__val tabular-nums">
                  ¥{{ fmt(form.postTaxMonthly) }}
                </text>
              </view>
              <view class="verify-detail__row verify-detail__row--highlight">
                <text class="verify-detail__label">
                  差异
                </text>
                <text class="verify-detail__val tabular-nums">
                  {{ verifyResult.postTaxDiff > 0 ? '+' : '' }}{{ fmt(verifyResult.postTaxDiff) }}
                </text>
              </view>
              <view class="verify-detail__hint mt-16rpx">
                应发税后 = 税前 − 个人社保 − 个人公积金 − 个税
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="mt-24rpx px-16rpx text-center text-22rpx text-#999 leading-relaxed">
        注：个税按累计预扣法核对；税后按「税前 − 个人社保 − 个人公积金 − 个税」核对。补全历史月份可提高浮动月薪的个税精度。
      </view>
    </view>

    <wd-calendar
      v-model:visible="showPayPeriodCalendar"
      v-model="payPeriodTs"
      type="month"
      switch-mode="year-month"
      :min-date="calendarMinDate"
      :max-date="calendarMaxDate"
      root-portal
      :z-index="popupZIndex"
      @confirm="onPayPeriodConfirm"
    />
    <wd-picker
      v-model:visible="showFieldAssignPicker"
      :model-value="[fieldKeys[0]]"
      :columns="FIELD_ASSIGN_OPTIONS"
      :title="fieldAssignTitle"
      root-portal
      :z-index="popupZIndex"
      @confirm="onFieldAssignConfirm"
    />
  </view>
</template>

<style scoped lang="scss">
:deep(.salary-cell-input) {
  flex: 1;
  min-width: 0;
}

:deep(.salary-form .wd-cell__body) {
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
}

:deep(.salary-form .wd-cell.is-link .wd-cell__body) {
  min-height: var(--wot-input-inner-height, 40rpx);
}

.verify-result {
  border-radius: 16rpx;
  padding: 28rpx 24rpx;
}

.verify-result--ok {
  background: var(--wot-success-surface);
  border: 2rpx solid var(--wot-success-particular);
}

.verify-result--warn {
  background: var(--wot-warning-surface);
  border: 2rpx solid var(--wot-warning-particular);
}

.verify-result__title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  line-height: 1.5;
}

.verify-result__desc {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
}

.verify-result__mode {
  display: block;
  font-size: 24rpx;
  color: #888;
  line-height: 1.55;
}

.verify-detail__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10rpx 0;
  font-size: 28rpx;
}

.verify-detail__row--highlight {
  font-weight: 600;
}

.verify-detail__label {
  color: #666;
}

.verify-detail__val {
  color: #333;
}

.verify-detail__hint {
  font-size: 28rpx;
  font-weight: 500;
  color: var(--wot-warning-main);
  line-height: 1.5;
}

.unmapped-row + .unmapped-row {
  border-top: 2rpx solid #edf0f6;
}
</style>

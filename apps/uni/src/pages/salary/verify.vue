<script lang="ts" setup>
/**
 * 月薪核对页
 * 主流程：选图识别 → 映射 6 字段 → 选所属月 → 写入/按 id 更新 → 跳转核对详情
 * 「重新核对」经 query 带 id 回填；必填税前、个税、税后
 * 拉新：捕获 from；未同意协议则门禁，同意后回本页
 */
import type { LineItem } from '@/types/salary-slip'
import type { PayslipFieldKey, PayslipMappedFields } from '@/utils/salarySlipFieldMap'
import { onLoad, onShow } from '@dcloudio/uni-app'
import dayjs from 'dayjs'
import { computed, ref, watch } from 'vue'
import { useSalarySlipRecognize } from '@/composables/useSalarySlipRecognize'
import { hasPrivacyAgreed, PRIVACY_GATE_PATH, setPrivacyReturnPath } from '@/constants/privacy'
import { useSalaryHistoryStore } from '@/store/salaryHistory'
import { captureChannelFromQuery } from '@/utils/channelFrom'
import { formatPayPeriod, formatPayPeriodLabel, payPeriodToTimestamp, previousPayPeriod } from '@/utils/payPeriod'
import { mapLineItemsToPayslipFields, PAYSLIP_FIELD_LABELS } from '@/utils/salarySlipFieldMap'
import { parseVerifyReentryQuery } from '@/utils/verifyReentry'

defineOptions({ name: 'SalaryVerify' })

definePage({
  style: {
    navigationBarTitleText: '工资条识别核对',
  },
})

const showDialog = ref(false)
const popupZIndex = 1100
const salaryHistoryStore = useSalaryHistoryStore()
const { previewPath, lineItems, chooseImage } = useSalarySlipRecognize()

const calendarMinDate = dayjs('2020-01-01').valueOf()
const calendarMaxDate = dayjs().add(1, 'year').endOf('year').valueOf()

const showPayPeriodCalendar = ref(false)
const showFieldAssignPicker = ref(false)
const showUnmapped = ref(false)
const payPeriod = ref(previousPayPeriod())
const payPeriodTs = ref(payPeriodToTimestamp(previousPayPeriod()))
/** 从详情「重新核对」进入时锁定所属月 */
const payPeriodLocked = ref(false)
/** 重新核对带入的历史 id；有值则提交按 id 更新 */
const editingId = ref('')
/** 防连点：提交落库 + 最少 loading 展示期间 */
const submitting = ref(false)
const pendingAssignItem = ref<LineItem | null>(null)

const form = ref<PayslipMappedFields>({
  preTaxMonthly: 0,
  ssPersonalAmount: 0,
  hfPersonalAmount: 0,
  specialDeductionMonthly: 0,
  personalIncomeTax: 0,
  postTaxMonthly: 0,
})

onLoad((options?: Record<string, string>) => {
  // 运营码/分享直达：与 reentry 短字段并存，from 不进表单
  captureChannelFromQuery(options)
  const payload = parseVerifyReentryQuery(options)
  if (!payload)
    return
  payPeriod.value = payload.payPeriod
  payPeriodTs.value = payPeriodToTimestamp(payload.payPeriod)
  form.value = { ...payload.form }
  payPeriodLocked.value = payload.lockPayPeriod
  editingId.value = payload.id ?? ''
})

onShow(() => {
  // 分享落地绕过首页时仍须过协议；同意后回本页（见 privacy return path）
  if (!hasPrivacyAgreed()) {
    setPrivacyReturnPath('/pages/salary/verify')
    uni.redirectTo({ url: PRIVACY_GATE_PATH })
  }
})

const unmappedItems = ref<LineItem[]>([])

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
  return `${label}：${val} 引用到`
})

watch(lineItems, (items) => {
  if (!items.length)
    return
  const mapped = mapLineItemsToPayslipFields(items)
  form.value = { ...mapped.fields }
  unmappedItems.value = mapped.unmappedItems
})

function parseNum(val: string | number) {
  const s = String(val ?? '').replace(/[^\d.]/g, '')
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function onFieldInput(key: PayslipFieldKey, val: string | number) {
  form.value[key] = parseNum(val)
}

function fieldDisplayValue(key: PayslipFieldKey): string {
  const v = form.value[key]
  return v > 0 ? String(v) : ''
}

function onPayPeriodConfirm({ value }: { value: number }) {
  if (payPeriodLocked.value)
    return
  payPeriodTs.value = value
  payPeriod.value = formatPayPeriod(value)
}

/** 锁定所属月时不允许打开日历（从详情重新核对进入） */
function openPayPeriodCalendar() {
  if (payPeriodLocked.value)
    return
  showPayPeriodCalendar.value = true
}

/** 成功态 loading 最少展示时长，给用户「正在计算」的体感 */
const SUBMIT_LOADING_MIN_MS = 2000

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

/**
 * 保存核对记录后直进详情页（结果在详情展示，本页不再渲染核对结果）
 * @note redirectTo 替换当前页，避免「详情→重新核对→详情」栈过深
 */
async function submitVerify() {
  if (submitting.value)
    return
  const required: PayslipFieldKey[] = ['preTaxMonthly', 'personalIncomeTax', 'postTaxMonthly']
  const missing = required.filter(key => !(form.value[key] > 0))
  if (missing.length) {
    const labels = missing.map(key => PAYSLIP_FIELD_LABELS[key]).join('、')
    uni.showToast({ title: `请填写${labels}`, icon: 'none' })
    return
  }
  submitting.value = true
  uni.showLoading({ title: '系统正在核对中，请稍后…', mask: true })
  try {
    // 接口与最少展示时间并行：慢网跟接口，快网也至少转满 SUBMIT_LOADING_MIN_MS
    const [record] = await Promise.all([
      salaryHistoryStore.upsertByPayPeriod({
        ...(editingId.value ? { id: editingId.value } : {}),
        payPeriod: payPeriod.value,
        preTaxMonthly: form.value.preTaxMonthly,
        ssPersonalAmount: form.value.ssPersonalAmount,
        hfPersonalAmount: form.value.hfPersonalAmount,
        specialDeductionMonthly: form.value.specialDeductionMonthly,
        personalIncomeTax: form.value.personalIncomeTax,
        postTaxMonthly: form.value.postTaxMonthly,
      }),
      delay(SUBMIT_LOADING_MIN_MS),
    ])
    if (editingId.value) {
      uni.navigateBack()
    }
    else {
      uni.navigateTo({
        url: `/pages/salary/verify-detail?id=${encodeURIComponent(record.id)}`,
      })
    }
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : '核对失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
  finally {
    uni.hideLoading()
    submitting.value = false
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
      <!-- 识别区 -->
      <view class="card-rounded p-24rpx">
        <view class="flex items-center gap-8rpx">
          <text class="mr-8rpx text-30rpx text-#333 font-600">
            工资条识别
          </text>
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

        <view class="mt-24rpx card-rounded border-4rpx border-#dcdfe6 border-dashed transition-colors" @click="chooseImage">
          <wd-img v-if="previewPath" width="100%" :src="previewPath" :enable-preview="true" mode="widthFix" radius="8rpx" />
          <view v-else class="flex flex-col items-center justify-center py-60rpx">
            <wd-icon name="scan" size="60rpx" color="#999" />
            <view class="mt-16rpx text-26rpx text-#999">
              点击拍照/选择图片
            </view>
          </view>
        </view>

        <!-- 识别明细 -->
        <view v-if="unmappedItems.length" class="mt-24rpx">
          <view class="flex items-center justify-between text-28rpx text-#333" @click="showUnmapped = !showUnmapped">
            <text>识别明细（{{ unmappedItems.length }} 项）</text>
            <wd-icon :name="showUnmapped ? 'up' : 'down'" size="28rpx" />
          </view>
          <view v-if="showUnmapped" class="mt-24rpx rounded-12rpx bg-#fafafa px-24rpx py-16rpx">
            <view
              v-for="(item, index) in unmappedItems"
              :key="`${item.key}-${index}`"
              class="unmapped-row flex items-center justify-between gap-16rpx py-16rpx"
            >
              <view class="min-w-0 flex-1 text-26rpx text-#333">
                <text>
                  {{ displayUnmappedLabel(item) }}：
                </text>
                <text class="tabular-nums">
                  {{ item.value }}
                </text>
              </view>
              <wd-button type="primary" variant="text" size="mini" custom-class="shrink-0" @click="openFieldAssign(item)">
                引用
              </wd-button>
            </view>
          </view>
        </view>
      </view>

      <!-- 核对表单 -->
      <view class="mt-24rpx card-rounded py-24rpx">
        <view class="flex items-center gap-8rpx px-24rpx">
          <text class="text-30rpx text-#333 font-600">
            核对信息（可编辑）
          </text>
        </view>
        <wd-form :model="form" center border value-align="right" :title-width="120" custom-class="mt-12rpx">
          <wd-form-item title="工资月份" :is-link="!payPeriodLocked" :value="payPeriodLabel" @click="openPayPeriodCalendar" />
          <wd-form-item v-for="key in fieldKeys" :key="key" :title="PAYSLIP_FIELD_LABELS[key]" :prop="key">
            <wd-input type="digit" align-right :model-value="fieldDisplayValue(key)" placeholder="0" @update:model-value="onFieldInput(key, $event)" />
          </wd-form-item>
        </wd-form>

        <view class="mt-12rpx flex gap-24rpx px-24rpx">
          <wd-button type="primary" variant="plain" block :round="true" @click="goVerifyHistory">
            核对历史
          </wd-button>
          <wd-button type="primary" block :round="true" :loading="submitting" :disabled="submitting" @click="submitVerify">
            开始核对
          </wd-button>
        </view>
      </view>

      <view class="mt-24rpx px-16rpx text-center text-22rpx text-#999 leading-relaxed">
        注：计算结果仅供参考，补全历史月份可提高浮动月薪的个税精度。
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
.unmapped-row + .unmapped-row {
  border-top: 2rpx solid #edf0f6;
}
</style>

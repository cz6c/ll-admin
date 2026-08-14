<script lang="ts" setup>
/**
 * 月薪核对页
 * 主流程：选图识别 → 映射表单字段 → 选所属月 → 写入/按 id 更新 → 进核对详情
 * 「重新核对」经 query 带 id 回填；必填税前、个税、税后（wd-form schema 校验 >0）
 * 新建成功 redirectTo 详情（不留录入页在栈）；重新核对保存 navigateBack
 * 其他扣款（缺勤等）可选，不进个税累计；拉新捕获 from / 隐私门禁
 */
import type { FormSchema } from '@wot-ui/ui'
import type { FormExpose } from '@wot-ui/ui/components/wd-form/types'
import type { LineItem } from '@/types/salary-slip'
import type { PayslipFieldKey, PayslipMappedFields } from '@/utils/salarySlipFieldMap'
import { onLoad, onShow } from '@dcloudio/uni-app'
import dayjs from 'dayjs'
import { computed, reactive, ref, watch } from 'vue'
import SalaryAbacusLoading from '@/components/salary/SalaryAbacusLoading.vue'
import { useSalarySlipRecognize } from '@/composables/useSalarySlipRecognize'
import { hasPrivacyAgreed, PRIVACY_GATE_PATH, setPrivacyReturnPath } from '@/constants/privacy'
import { useSalaryHistoryStore } from '@/store/salaryHistory'
import { captureChannelFromQuery, normalizeChannelFrom } from '@/utils/channelFrom'
import { formatPayPeriod, formatPayPeriodLabel, payPeriodToTimestamp, previousPayPeriod } from '@/utils/payPeriod'
import { mapLineItemsToPayslipFields, PAYSLIP_FIELD_LABELS, PAYSLIP_FIELD_PLACEHOLDERS } from '@/utils/salarySlipFieldMap'
import { parseVerifyReentryQuery } from '@/utils/verifyReentry'

defineOptions({ name: 'SalaryVerify' })

definePage({
  style: {
    navigationBarTitleText: '工资条识别核对',
  },
})

/** 所属月 YYYY-MM（缺月补全深链 payPeriod=） */
const PAY_PERIOD_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/

/** 提交必填金额项：须 >0，与累计预扣核对输入一致 */
const REQUIRED_AMOUNT_KEYS: PayslipFieldKey[] = [
  'preTaxMonthly',
  'personalIncomeTax',
  'postTaxMonthly',
]

const showDialog = ref(false)
const popupZIndex = 1100
const salaryHistoryStore = useSalaryHistoryStore()
const { previewPath, lineItems, recognizeHints, loading: recognizing, chooseImage } = useSalarySlipRecognize()

const calendarMinDate = dayjs('2020-01-01').valueOf()
/** 工资条通常次月才发：日历最晚选到上月，禁选当月及以后 */
const calendarMaxDate = dayjs(`${previousPayPeriod()}-01`).endOf('month').valueOf()

const showPayPeriodCalendar = ref(false)
const showFieldAssignPicker = ref(false)
const showUnmapped = ref(false)
/** 分享/渠道落地：页顶可关闭语境条，避免好友看到空表无上下文 */
const showShareLandingTip = ref(false)
const payPeriod = ref(previousPayPeriod())
const payPeriodTs = ref(payPeriodToTimestamp(previousPayPeriod()))
/** 从详情「重新核对」进入时锁定所属月 */
const payPeriodLocked = ref(false)
/** 重新核对带入的历史 id；有值则提交按 id 更新 */
const editingId = ref('')
/** 防连点：提交落库期间 */
const submitting = ref(false)
const pendingAssignItem = ref<LineItem | null>(null)
const formRef = ref<FormExpose>()

/** 识别中或提交中均展示品牌加载层 */
const showLionLoading = computed(() => recognizing.value || submitting.value)
const lionLoadingTip = computed(() => {
  if (recognizing.value)
    return '薪算狮正在识别…'
  return '薪算狮努力核对中…'
})

/** 用 reactive：与 wot-ui 示例一致，避免 ref 模型在 schema.validate 时读不到字段 */
const form = reactive<PayslipMappedFields>({
  preTaxMonthly: 0,
  ssPersonalAmount: 0,
  hfPersonalAmount: 0,
  otherDeductionAmount: 0,
  specialDeductionMonthly: 0,
  personalIncomeTax: 0,
  postTaxMonthly: 0,
})

/**
 * 三项金额必填且须大于 0（0/空展示为 placeholder，不能当有效输入）
 */
const formSchema: FormSchema = {
  validate(model) {
    return REQUIRED_AMOUNT_KEYS
      .filter(key => !(Number(model[key]) > 0))
      .map(key => ({
        path: [key],
        message: `请填写${PAYSLIP_FIELD_LABELS[key]}`,
      }))
  },
  isRequired(path) {
    return (REQUIRED_AMOUNT_KEYS as string[]).includes(path)
  },
}

onLoad((options?: Record<string, string>) => {
  // 运营码/分享直达：与 reentry 短字段并存，from 不进表单
  captureChannelFromQuery(options)
  if (normalizeChannelFrom(options?.from))
    showShareLandingTip.value = true

  const payload = parseVerifyReentryQuery(options)
  if (payload) {
    payPeriod.value = payload.payPeriod
    payPeriodTs.value = payPeriodToTimestamp(payload.payPeriod)
    Object.assign(form, payload.form)
    payPeriodLocked.value = payload.lockPayPeriod
    editingId.value = payload.id ?? ''
    return
  }

  // 缺月补全（首页进度 / 对照表）：仅预填所属月，不锁月、不带回金额
  const pp = String(options?.payPeriod || '').trim()
  if (PAY_PERIOD_RE.test(pp)) {
    // 与日历上限一致：当月及以后回落到上月
    const allowed = pp > previousPayPeriod() ? previousPayPeriod() : pp
    payPeriod.value = allowed
    payPeriodTs.value = payPeriodToTimestamp(allowed)
  }
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
  'otherDeductionAmount',
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

/**
 * OCR 空明细或三项必填未齐时提示手填，降低识别失败弃用率
 */
const showManualHint = computed(() => {
  const incomplete = REQUIRED_AMOUNT_KEYS.some(key => !(form[key] > 0))
  const ocrEmpty = !!previewPath.value && !recognizing.value && lineItems.value.length === 0
  return ocrEmpty || incomplete
})

/**
 * 横幅串行：识别提示 > 分享落地 > 手填引导，同时只展示一条
 */
const activeBanner = computed<'recognize' | 'share' | 'manual' | null>(() => {
  if (recognizeHints.value.length)
    return 'recognize'
  if (showShareLandingTip.value)
    return 'share'
  if (showManualHint.value)
    return 'manual'
  return null
})

watch(lineItems, (items) => {
  if (!items.length)
    return
  const mapped = mapLineItemsToPayslipFields(items)
  Object.assign(form, mapped.fields)
  unmappedItems.value = mapped.unmappedItems
})

function parseNum(val: string | number) {
  const s = String(val ?? '').replace(/[^\d.]/g, '')
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function onFieldInput(key: PayslipFieldKey, val: string | number) {
  form[key] = parseNum(val)
}

function fieldDisplayValue(key: PayslipFieldKey): string {
  const v = form[key]
  return v > 0 ? String(v) : ''
}

function onPayPeriodConfirm({ value }: { value: number }) {
  if (payPeriodLocked.value)
    return
  const next = formatPayPeriod(value)
  // 与 max-date 双保险：当月及以后不可核
  if (next > previousPayPeriod()) {
    uni.showToast({ title: '只能选择上月及以前', icon: 'none' })
    return
  }
  payPeriodTs.value = value
  payPeriod.value = next
}

/** 锁定所属月时不允许打开日历（从详情重新核对进入） */
function openPayPeriodCalendar() {
  if (payPeriodLocked.value)
    return
  showPayPeriodCalendar.value = true
}

/**
 * 保存核对记录后进入详情（本页不再渲染结果）
 * @note 新建用 redirectTo 替换本页，保证：首页→录入→详情→回首页；对照→录入→详情→回对照
 * @note 重新核对带 id 用 navigateBack，保证：详情→录入→回详情
 * @note 品牌 loading 至少展示 1s，避免接口过快一闪而过
 * @note schema 为拦截准绳：MP 下 form-item 可能未注册进 form，仅靠 validate().valid 会误放行
 */
async function submitVerify() {
  if (submitting.value)
    return

  const issues = await Promise.resolve(formSchema.validate(form))
  if (issues.length > 0) {
    // 尽量触发表单项红字；子项未挂载时 valid 仍可能为 true，需 toast 兜底
    const result = await formRef.value?.validate()
    if (!result || result.valid) {
      uni.showToast({ title: issues[0]!.message, icon: 'none' })
    }
    return
  }

  // 深链误带当月/未来月时拦截；重新核对锁定所属月不改此规则以外的存量
  if (!payPeriodLocked.value && payPeriod.value > previousPayPeriod()) {
    uni.showToast({ title: '只能选择上月及以前', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    const [record] = await Promise.all([
      salaryHistoryStore.upsertByPayPeriod({
        ...(editingId.value ? { id: editingId.value } : {}),
        payPeriod: payPeriod.value,
        preTaxMonthly: form.preTaxMonthly,
        ssPersonalAmount: form.ssPersonalAmount,
        hfPersonalAmount: form.hfPersonalAmount,
        otherDeductionAmount: form.otherDeductionAmount,
        specialDeductionMonthly: form.specialDeductionMonthly,
        personalIncomeTax: form.personalIncomeTax,
        postTaxMonthly: form.postTaxMonthly,
      }),
      new Promise<void>(resolve => setTimeout(resolve, 1000)),
    ])
    if (editingId.value) {
      uni.navigateBack()
      return
    }
    // 替换录入页，避免返回落到空白核对表
    uni.redirectTo({
      url: `/pages/salary/verify-detail?id=${encodeURIComponent(record.id)}`,
    })
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : '核对失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
  finally {
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
  form[key] = parseNum(item.value)
  pendingAssignItem.value = null
  uni.showToast({
    title: `已填入${PAYSLIP_FIELD_LABELS[key]}`,
    icon: 'success',
  })
}

function dismissShareLandingTip() {
  showShareLandingTip.value = false
}
</script>

<template>
  <view class="page-shell pb-safe">
    <SalaryAbacusLoading :visible="showLionLoading" :tip="lionLoadingTip" />
    <view class="p-24rpx">
      <view
        v-if="activeBanner === 'share'"
        class="share-landing-tip m-[-24rpx] mb-24rpx"
      >
        <text class="share-landing-tip__text">
          好友在用累计预扣法核对工资条，上传或手动填写即可
        </text>
        <view
          class="share-landing-tip__close"
          hover-class="pressable-fade--pressed"
          :hover-stay-time="50"
          @click="dismissShareLandingTip"
        >
          <wd-icon name="close" size="28rpx" color="#c0c4cc" />
        </view>
      </view>

      <!-- 识别区：上传为主，说明收进 ? -->
      <view class="card-rounded p-24rpx">
        <view class="flex items-center gap-8rpx">
          <text class="mr-8rpx text-30rpx text-#333 font-600">
            上传工资条
          </text>
          <wd-icon name="question-circle" size="28rpx" class="text-primary" @click="showDialog = true" />
          <wd-popup v-model="showDialog" custom-class="rounded-24rpx" :close-on-click-modal="false">
            <view class="w-600rpx rounded-24rpx bg-white p-40rpx">
              <scroll-view scroll-y class="max-h-520rpx">
                <view class="whitespace-pre-wrap text-26rpx text-#666 leading-relaxed">
                  <view>1.请确保图片角度正常、文字清晰；倾斜时系统会尝试校正，仍建议重新拍正。</view>
                  <view>2.系统将自动识别工资条明细填入核对表单，请核对后再保存。</view>
                  <view>3.识别完成后系统会立即删除图片，不留存。</view>
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

        <view
          v-if="activeBanner === 'recognize'"
          class="recognize-hints mt-16rpx"
        >
          <view
            v-for="hint in recognizeHints"
            :key="hint.code"
            class="recognize-hints__item"
          >
            <wd-icon name="warning" size="28rpx" class="recognize-hints__icon" />
            <text class="recognize-hints__text">
              {{ hint.message }}
            </text>
          </view>
        </view>

        <view
          class="upload-zone mt-24rpx card-rounded border-4rpx border-#dcdfe6 border-dashed"
          hover-class="upload-zone--pressed"
          :hover-stay-time="80"
          @click="chooseImage"
        >
          <wd-img v-if="previewPath" width="100%" :src="previewPath" mode="widthFix" radius="8rpx" />
          <view v-else class="flex flex-col items-center justify-center py-60rpx">
            <wd-icon name="scan" size="60rpx" color="#999" />
            <view class="mt-16rpx text-26rpx text-#999">
              点击拍照/选择图片
            </view>
          </view>
        </view>

        <!-- 识别明细 -->
        <view v-if="unmappedItems.length" class="mt-24rpx">
          <view
            class="pressable flex items-center justify-between text-28rpx text-#333"
            hover-class="pressable-soft--pressed"
            :hover-stay-time="60"
            @click="showUnmapped = !showUnmapped"
          >
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

      <!-- 核对表单：六项金额同级展示（社保/公积金/专项与必填同等重要） -->
      <view class="mt-24rpx card-rounded py-24rpx">
        <view v-if="activeBanner === 'manual'" class="manual-hint mx-24rpx">
          识别不准？直接填写税前、个税、税后三项进行核对
        </view>
        <wd-form
          ref="formRef"
          :model="form"
          :schema="formSchema"
          error-type="message"
          center
          border
          value-align="right"
          :title-width="120"
          custom-class="mt-12rpx"
        >
          <wd-form-item title="工资月份" :is-link="!payPeriodLocked" :value="payPeriodLabel" @click="openPayPeriodCalendar" />
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
              :placeholder="PAYSLIP_FIELD_PLACEHOLDERS[key]"
              @update:model-value="onFieldInput(key, $event)"
            />
          </wd-form-item>
        </wd-form>

        <!-- 单主 CTA；历史降为文案链，避免双主按钮平分注意力 -->
        <view class="mt-12rpx px-24rpx">
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

.share-landing-tip {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background: var(--wot-primary-1);
  animation: tip-enter 200ms var(--ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)) both;
}

.share-landing-tip__text {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: var(--wot-primary-6);
}

.share-landing-tip__close {
  flex-shrink: 0;
  padding: 4rpx;
}

@keyframes tip-enter {
  from {
    opacity: 0;
    transform: translateY(-8rpx) scale(0.97);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.manual-hint {
  padding: 16rpx 20rpx;
  border-radius: 12rpx;
  font-size: 24rpx;
  line-height: 1.4;
  color: #8a8f99;
  background: #f7f8fa;
}

.recognize-hints {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.recognize-hints__item {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 16rpx 20rpx;
  border-radius: 12rpx;
  background: var(--wot-warning-surface);
  border: 1rpx solid var(--wot-warning-particular, var(--wot-warning-surface));
  /* 偶发提示：从略下沉 + 半透明进场，避免 v-if 硬切；scale≥0.95 */
  animation: hint-enter 200ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

.recognize-hints__item:nth-child(2) {
  animation-delay: 40ms;
}

.recognize-hints__item:nth-child(3) {
  animation-delay: 80ms;
}

.recognize-hints__icon {
  flex-shrink: 0;
  margin-top: 2rpx;
  color: var(--wot-warning-main);
}

.recognize-hints__text {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  line-height: 1.45;
  color: var(--wot-warning-main);
}

.upload-zone {
  transition:
    transform 140ms cubic-bezier(0.23, 1, 0.32, 1),
    border-color 140ms ease,
    background-color 140ms ease;
}

.upload-zone--pressed {
  transform: scale(0.985);
  border-color: var(--wot-primary-4);
  background-color: var(--wot-primary-1);
}

@keyframes hint-enter {
  from {
    opacity: 0;
    transform: translateY(8rpx) scale(0.97);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .recognize-hints__item {
    animation: none;
  }

  .share-landing-tip {
    animation: none;
  }
}
</style>

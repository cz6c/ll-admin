<script lang="ts" setup>
/**
 * 年薪测算页
 * 主流程：编辑本地表单 → 保存历史后进明细；「重新测算」经 query 带 id 回填并更新
 * 注意：月薪变更时若选了「N 倍月薪」奖金倍数，会同步重算 yearEndBonus
 */
import type { SalaryCalcInput, YearEndTaxMode } from '@/utils/salaryCalculator'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { computed, ref, watch } from 'vue'
import SalaryAbacusLoading from '@/components/salary/SalaryAbacusLoading.vue'
import { hasPrivacyAgreed, PRIVACY_GATE_PATH, setPrivacyReturnPath } from '@/constants/privacy'
import { salaryOptionLabel, YEAR_END_TAX_OPTIONS } from '@/constants/salaryFormOptions'
import { useSalaryHistoryStore } from '@/store/salaryHistory'
import { parseCalcReentryQuery } from '@/utils/calcReentry'
import { captureChannelFromQuery, normalizeChannelFrom } from '@/utils/channelFrom'

defineOptions({ name: 'SalaryCalc' })

definePage({
  style: {
    navigationBarTitleText: '年薪税后测算',
  },
})

/** 须高于自定义 TabBar（src/tabbar/index.vue 内 z-index:1000），否则弹出层会被挡住 */
const popupZIndex = 1100
const salaryHistoryStore = useSalaryHistoryStore()

/**
 * 默认表单：月薪 10000、单独计税、年终奖 0
 * 单独计税为常见默认，避免用户未选模式时年终奖被并入综合所得
 */
function defaultForm(): SalaryCalcInput {
  return {
    preTaxMonthly: 10000,
    yearEndTaxMode: 'separate',
    yearEndBonus: 0,
    ssPersonalAmount: 0,
    hfPersonalAmount: 0,
    specialDeductionMonthly: 0,
  }
}

/** 勿命名为 input：小程序编译会与原生 <input> 混淆，生成错误变量名 */
const salaryForm = ref<SalaryCalcInput>(defaultForm())
/** 重新测算带入的历史 id；有值则提交按 id 更新 */
const editingId = ref('')

const showYearEndModePicker = ref(false)
/** 七项专项附加扣除标准说明 */
const showSpecialDeductionTip = ref(false)
/** 防连点：提交落库期间 */
const submitting = ref(false)
/** 分享落地页顶轻提示（可关闭） */
const showShareLandingTip = ref(false)

const yearEndModeLabel = computed(() => salaryOptionLabel(YEAR_END_TAX_OPTIONS, salaryForm.value.yearEndTaxMode))

const bonusMultipliers = [1, 2, 3, 4, 6, 8, 10] as const
/** 当前选中的「N 倍月薪」；未设奖金或手动改金额后为 null，避免 ×1 假选中 */
const selectedBonusMul = ref<number | null>(null)

/** 回填后若年终奖恰为某倍数×月薪，恢复倍数标签选中态 */
function syncBonusMulFromForm() {
  const { preTaxMonthly, yearEndBonus } = salaryForm.value
  if (!(preTaxMonthly > 0) || yearEndBonus <= 0) {
    selectedBonusMul.value = null
    return
  }
  const hit = bonusMultipliers.find(m => Math.round(preTaxMonthly * m) === yearEndBonus)
  selectedBonusMul.value = hit ?? null
}

onLoad((options?: Record<string, string>) => {
  captureChannelFromQuery(options)
  if (normalizeChannelFrom(options?.from))
    showShareLandingTip.value = true
  const payload = parseCalcReentryQuery(options)
  if (!payload)
    return
  salaryForm.value = { ...payload.form }
  editingId.value = payload.id ?? ''
  syncBonusMulFromForm()
})

onShow(() => {
  if (!hasPrivacyAgreed()) {
    setPrivacyReturnPath('/pages/salary/calc')
    uni.redirectTo({ url: PRIVACY_GATE_PATH })
  }
})

// 月薪变化时：若年终奖已是「倍数×月薪」则保持选中态；奖金为 0 时清空倍数选中
watch(
  () => salaryForm.value.preTaxMonthly,
  () => {
    if (selectedBonusMul.value != null) {
      patchForm({ yearEndBonus: Math.round(salaryForm.value.preTaxMonthly * selectedBonusMul.value) })
      return
    }
    if (salaryForm.value.yearEndBonus === 0)
      selectedBonusMul.value = null
  },
)

function patchForm(p: Partial<SalaryCalcInput>) {
  salaryForm.value = { ...salaryForm.value, ...p }
}

/** 快捷设置年终奖 = 月薪 × 倍数 */
function applyBonusMul(m: number) {
  selectedBonusMul.value = m
  patchForm({ yearEndBonus: Math.round(salaryForm.value.preTaxMonthly * m) })
}

function parseNum(val: string | number, intOnly = false) {
  const s = String(val ?? '')
  const cleaned = intOnly ? s.replace(/\D/g, '') : s.replace(/[^\d.]/g, '')
  const n = intOnly ? Number.parseInt(cleaned, 10) : Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function onPreTaxInput(val: string | number) {
  patchForm({ preTaxMonthly: parseNum(val) })
}

function onBonusInput(val: string | number) {
  selectedBonusMul.value = null
  patchForm({ yearEndBonus: parseNum(val) })
}

function onSsPersonalAmountInput(val: string | number) {
  patchForm({ ssPersonalAmount: parseNum(val) })
}

function onSpecialInput(val: string | number) {
  patchForm({ specialDeductionMonthly: parseNum(val) })
}

function onHfPersonalAmountInput(val: string | number) {
  patchForm({ hfPersonalAmount: parseNum(val) })
}

function onYearEndModeConfirm({ value }: { value: (string | number)[] }) {
  patchForm({ yearEndTaxMode: value[0] as YearEndTaxMode })
}

/**
 * 先落库测算历史再进明细，保证详情可按 id 回看
 * @note 品牌 loading 至少展示 1s，避免接口过快一闪而过
 */
async function submitCalc() {
  if (submitting.value)
    return
  submitting.value = true
  try {
    const [row] = await Promise.all([
      salaryHistoryStore.createHistory({ ...salaryForm.value }, editingId.value || undefined),
      new Promise<void>(resolve => setTimeout(resolve, 1000)),
    ])
    if (editingId.value) {
      uni.navigateBack()
    }
    else {
      uni.navigateTo({ url: `/pages/salary/detail?id=${encodeURIComponent(row.id)}` })
    }
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : '测算失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
  finally {
    submitting.value = false
  }
}

/** 次级入口：与首页「全部记录」文案对齐，带测算 tab */
function goAllRecords() {
  uni.navigateTo({ url: '/pages/salary/history?tab=calc' })
}

function dismissShareLandingTip() {
  showShareLandingTip.value = false
}
</script>

<template>
  <page-meta :page-style="`overflow:${showSpecialDeductionTip ? 'hidden' : 'visible'};`" />
  <view class="page-shell">
    <SalaryAbacusLoading :visible="submitting" tip="薪算狮努力测算中…" />
    <view class="px-24rpx pb-24rpx pt-24rpx">
      <view
        v-if="showShareLandingTip"
        class="share-landing-tip m-[-24rpx] mb-24rpx"
      >
        <text class="share-landing-tip__text">
          好友在测算全年到手，输入月薪即可估算
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

      <wd-form :model="salaryForm" center value-align="right" :title-width="100" custom-class="salary-form">
        <wd-cell-group center custom-class="card-rounded mb-24rpx" border>
          <wd-form-item title="税前月薪" prop="preTaxMonthly">
            <wd-input
              type="digit"
              align-right
              :model-value="salaryForm.preTaxMonthly ? String(salaryForm.preTaxMonthly) : ''"
              placeholder="0"
              custom-class="salary-cell-input"
              @update:model-value="onPreTaxInput"
            />
          </wd-form-item>
          <wd-form-item
            title="年终计税方式"
            :title-width="120"
            prop="yearEndTaxMode"
            is-link
            :value="yearEndModeLabel"
            placeholder="请选择计税方式"
            @click="showYearEndModePicker = true"
          />
          <wd-form-item title="年终奖" prop="yearEndBonus">
            <wd-input
              type="digit"
              align-right
              :model-value="salaryForm.yearEndBonus ? String(salaryForm.yearEndBonus) : ''"
              placeholder="请输入奖金"
              custom-class="salary-cell-input"
              @update:model-value="onBonusInput"
            />
          </wd-form-item>
        </wd-cell-group>

        <!-- 贴在年终奖下方：快捷倍数，与字段映射一致 -->
        <view class="bonus-mul mb-24rpx">
          <text class="bonus-mul__lab">
            快捷：月薪 × N
          </text>
          <scroll-view scroll-x class="whitespace-nowrap" :show-scrollbar="false">
            <view class="inline-flex gap-16rpx py-8rpx">
              <wd-tag
                v-for="m in bonusMultipliers"
                :key="m"
                :type="selectedBonusMul === m ? 'primary' : 'default'"
                variant="plain"
                round
                @click="applyBonusMul(m)"
              >
                {{ m === 1 ? '×1' : `×${m}` }}
              </wd-tag>
            </view>
          </scroll-view>
        </view>

        <wd-cell-group center custom-class="card-rounded mb-24rpx" border>
          <wd-form-item title="社保（月）" :title-width="120" prop="ssPersonalAmount">
            <wd-input
              type="digit"
              align-right
              :model-value="salaryForm.ssPersonalAmount ? String(salaryForm.ssPersonalAmount) : ''"
              placeholder="五险个人部分"
              custom-class="salary-cell-input"
              @update:model-value="onSsPersonalAmountInput"
            />
          </wd-form-item>
          <wd-form-item title="公积金（月）" :title-width="120" prop="hfPersonalAmount">
            <wd-input
              type="digit"
              align-right
              :model-value="salaryForm.hfPersonalAmount ? String(salaryForm.hfPersonalAmount) : ''"
              placeholder="个人月缴存"
              custom-class="salary-cell-input"
              @update:model-value="onHfPersonalAmountInput"
            />
          </wd-form-item>
          <wd-form-item :title-width="140" prop="specialDeductionMonthly">
            <template #title>
              <view class="flex items-center">
                <text>专项附加（月）</text>
                <wd-icon name="question-circle" size="32rpx" class="text-primary" @click.stop="showSpecialDeductionTip = true" />
              </view>
            </template>
            <wd-input
              type="digit"
              align-right
              :model-value="salaryForm.specialDeductionMonthly ? String(salaryForm.specialDeductionMonthly) : ''"
              placeholder="七项合计"
              custom-class="salary-cell-input"
              @update:model-value="onSpecialInput"
            />
          </wd-form-item>
        </wd-cell-group>
      </wd-form>

      <!-- 单主 CTA；历史降为文案链，避免双大按钮叠放 -->
      <wd-button :block="true" :round="true" size="large" type="primary" :loading="submitting" :disabled="submitting" @click="submitCalc">
        开始测算
      </wd-button>
      <view
        class="history-link pressable mt-28rpx text-center text-26rpx text-primary"
        hover-class="pressable--pressed"
        :hover-stay-time="60"
        @click="goAllRecords"
      >
        全部记录
      </view>
      <view class="mt-24rpx px-16rpx text-center text-22rpx text-#999 leading-relaxed">
        注：计算结果仅供参考
      </view>
    </view>

    <wd-picker
      v-model:visible="showYearEndModePicker"
      :model-value="[salaryForm.yearEndTaxMode]"
      :columns="YEAR_END_TAX_OPTIONS"
      title="年终计税方式"
      root-portal
      :z-index="popupZIndex"
      @confirm="onYearEndModeConfirm"
    />
    <wd-popup v-model="showSpecialDeductionTip" position="bottom" :z-index="popupZIndex" root-portal :safe-area-inset-bottom="true" closable lock-scroll>
      <view class="special-deduction-sheet max-h-75vh flex flex-col rounded-t-24rpx bg-white">
        <view class="shrink-0 border-b border-#edf0f6 p-32rpx text-center text-32rpx text-#333 font-600">
          七项扣除具体金额标准
        </view>
        <scroll-view scroll-y class="special-deduction-sheet__scroll" :show-scrollbar="true">
          <view class="px-32rpx py-24rpx pb-48rpx">
            <view class="special-deduction-item mb-28rpx last:mb-0">
              <text class="special-deduction-item__title">1. 3岁以下婴幼儿照护</text>
              <text class="special-deduction-item__text">每个婴幼儿每月2000元。</text>
            </view>
            <view class="special-deduction-item mb-28rpx last:mb-0">
              <text class="special-deduction-item__title">2. 子女教育</text>
              <text class="special-deduction-item__text">每个子女每月2000元，涵盖学前教育至博士研究生教育。</text>
            </view>
            <view class="special-deduction-item mb-28rpx last:mb-0">
              <text class="special-deduction-item__title">3. 赡养老人</text>
              <text class="special-deduction-item__text">独生子女：每月3000元。</text>
              <text class="special-deduction-item__text special-deduction-item__text--sub">
                非独生子女：与兄弟姐妹分摊每月3000元额度，每人每月不超过1500元。
              </text>
            </view>
            <view class="special-deduction-item mb-28rpx last:mb-0">
              <text class="special-deduction-item__title">4. 住房贷款利息</text>
              <text class="special-deduction-item__text">每月1000元，扣除期限最长不超过240个月。</text>
            </view>
            <view class="special-deduction-item mb-28rpx last:mb-0">
              <text class="special-deduction-item__title">5. 住房租金</text>
              <text class="special-deduction-item__text">根据城市规模分三档，每月1500元、1100元或800元。</text>
            </view>
            <view class="special-deduction-item mb-28rpx last:mb-0">
              <text class="special-deduction-item__title">6. 继续教育</text>
              <text class="special-deduction-item__text">学历（学位）继续教育：每月400元。</text>
              <text class="special-deduction-item__text special-deduction-item__text--sub">职业资格继续教育：取得证书当年扣除3600元。</text>
            </view>
            <view class="special-deduction-item mb-28rpx last:mb-0">
              <text class="special-deduction-item__title">7. 大病医疗</text>
              <text class="special-deduction-item__text">医保目录范围内自付部分累计超过1.5万元，在8万元限额内据实扣除。</text>
            </view>
          </view>
        </scroll-view>
      </view>
    </wd-popup>
  </view>
</template>

<style scoped lang="scss">
.share-landing-tip {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background: var(--wot-primary-1);
  /* 分享落地偶发：短进场防硬切；scale≥0.95，不用 scale(0) */
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

.bonus-mul {
  padding: 0 8rpx;
}

.bonus-mul__lab {
  display: block;
  margin-bottom: 4rpx;
  font-size: 22rpx;
  color: #8a9199;
  letter-spacing: 0.01em;
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

@media (prefers-reduced-motion: reduce) {
  .share-landing-tip {
    animation: none;
  }
}

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

.special-deduction-sheet__scroll {
  max-height: calc(75vh - 112rpx);
}

.special-deduction-item__title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
  line-height: 1.5;
  margin-bottom: 12rpx;
}

.special-deduction-item__text {
  display: block;
  font-size: 26rpx;
  color: #555;
  line-height: 1.65;
}

.special-deduction-item__text--sub {
  margin-top: 8rpx;
  color: #666;
}
</style>

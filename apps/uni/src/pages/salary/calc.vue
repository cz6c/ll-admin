<script lang="ts" setup>
import type { YearEndTaxMode } from '@/utils/salaryCalculator'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  salaryOptionLabel,
  YEAR_END_TAX_OPTIONS,
} from '@/constants/salaryFormOptions'
import { useSalaryCalcStore } from '@/store/salaryCalc'
import { useSalaryHistoryStore } from '@/store/salaryHistory'

defineOptions({ name: 'SalaryCalc' })

definePage({
  style: {
    navigationBarTitleText: '税后工资计算',
  },
})

/** 须高于自定义 TabBar（src/tabbar/index.vue 内 z-index:1000），否则弹出层会被挡住 */
const popupZIndex = 1100
const store = useSalaryCalcStore()
const salaryHistoryStore = useSalaryHistoryStore()
/** 勿命名为 input：小程序编译会与原生 <input> 混淆，生成错误变量名 */
const { input: salaryForm } = storeToRefs(store)

const showYearEndModePicker = ref(false)
/** 七项专项附加扣除标准说明 */
const showSpecialDeductionTip = ref(false)

const yearEndModeLabel = computed(() =>
  salaryOptionLabel(YEAR_END_TAX_OPTIONS, salaryForm.value.yearEndTaxMode),
)

const bonusMultipliers = [1, 2, 3, 4, 6, 8, 10] as const
const selectedBonusMul = ref<number | null>(1)

watch(
  () => salaryForm.value.preTaxMonthly,
  () => {
    if (selectedBonusMul.value != null && salaryForm.value.yearEndBonus === Math.round(salaryForm.value.preTaxMonthly * selectedBonusMul.value)) {
      return
    }
    if (salaryForm.value.yearEndBonus === 0)
      selectedBonusMul.value = 1
  },
)

function applyBonusMul(m: number) {
  selectedBonusMul.value = m
  store.patchInput({ yearEndBonus: Math.round(salaryForm.value.preTaxMonthly * m) })
}

function parseNum(val: string | number, intOnly = false) {
  const s = String(val ?? '')
  const cleaned = intOnly ? s.replace(/\D/g, '') : s.replace(/[^\d.]/g, '')
  const n = intOnly ? Number.parseInt(cleaned, 10) : Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function onPreTaxInput(val: string | number) {
  store.patchInput({ preTaxMonthly: parseNum(val) })
}

function onBonusInput(val: string | number) {
  selectedBonusMul.value = null
  store.patchInput({ yearEndBonus: parseNum(val) })
}

function onSsPersonalAmountInput(val: string | number) {
  store.patchInput({ ssPersonalAmount: parseNum(val) })
}

function onSpecialInput(val: string | number) {
  store.patchInput({ specialDeductionMonthly: parseNum(val) })
}

function onHfPersonalAmountInput(val: string | number) {
  store.patchInput({ hfPersonalAmount: parseNum(val) })
}

function onYearEndModeConfirm({ value }: { value: (string | number)[] }) {
  store.patchInput({ yearEndTaxMode: value[0] as YearEndTaxMode })
}

async function goDetail() {
  try {
    const row = await salaryHistoryStore.createHistory({ ...salaryForm.value })
    uni.navigateTo({ url: `/pages/salary/detail?id=${encodeURIComponent(row.id)}` })
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : '历史记录保存失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
}

function goHistory() {
  uni.navigateTo({ url: '/pages/salary/history?tab=calc' })
}

function goVerify() {
  uni.navigateTo({ url: '/pages/salary/verify' })
}
</script>

<template>
  <page-meta :page-style="`overflow:${showSpecialDeductionTip ? 'hidden' : 'visible'};`" />
  <view class="page-shell">
    <view class="px-24rpx pb-24rpx pt-24rpx">
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

        <scroll-view scroll-x class="mb-24rpx whitespace-nowrap px-8rpx" :show-scrollbar="false">
          <view class="inline-flex gap-16rpx py-8rpx">
            <wd-tag
              v-for="m in bonusMultipliers"
              :key="m"
              :type="selectedBonusMul === m ? 'primary' : 'default'"
              variant="plain"
              round
              @click="applyBonusMul(m)"
            >
              {{ m === 1 ? '月薪×1' : `×${m}` }}
            </wd-tag>
          </view>
        </scroll-view>

        <wd-cell-group center custom-class="card-rounded mb-24rpx" border>
          <wd-form-item title="社保个缴金额（月）" :title-width="140" prop="ssPersonalAmount">
            <wd-input
              type="digit"
              align-right
              :model-value="salaryForm.ssPersonalAmount ? String(salaryForm.ssPersonalAmount) : ''"
              placeholder="五险个人部分合计"
              custom-class="salary-cell-input"
              @update:model-value="onSsPersonalAmountInput"
            />
          </wd-form-item>
          <wd-form-item title="公积金个缴金额（月）" :title-width="140" prop="hfPersonalAmount">
            <wd-input
              type="digit"
              align-right
              :model-value="salaryForm.hfPersonalAmount ? String(salaryForm.hfPersonalAmount) : ''"
              placeholder="个人月缴存额"
              custom-class="salary-cell-input"
              @update:model-value="onHfPersonalAmountInput"
            />
          </wd-form-item>
          <wd-form-item :title-width="160" prop="specialDeductionMonthly">
            <template #title>
              <view class="flex items-center">
                <text>专项附加扣除（月）</text>
                <wd-icon
                  name="question-circle"
                  size="32rpx"
                  class="text-primary"
                  @click.stop="showSpecialDeductionTip = true"
                />
              </view>
            </template>
            <wd-input
              type="digit"
              align-right
              :model-value="salaryForm.specialDeductionMonthly ? String(salaryForm.specialDeductionMonthly) : ''"
              placeholder="请输入具体数额"
              custom-class="salary-cell-input"
              @update:model-value="onSpecialInput"
            />
          </wd-form-item>
        </wd-cell-group>
      </wd-form>

      <wd-button :block="true" :round="true" size="large" type="primary" @click="goDetail">
        查看明细
      </wd-button>
      <wd-button
        :block="true"
        :round="true"
        size="large"
        variant="plain"
        custom-class="mt-24rpx"
        @click="goVerify"
      >
        月薪核对
      </wd-button>
      <!-- <wd-button
        :block="true"
        :round="true"
        size="large"
        variant="plain"
        custom-class="mt-24rpx"
        @click="goHistory"
      >
        历史记录
      </wd-button> -->
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
    <wd-popup
      v-model="showSpecialDeductionTip"
      position="bottom"
      :z-index="popupZIndex"
      root-portal
      :safe-area-inset-bottom="true"
      closable
      lock-scroll
    >
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
              <text class="special-deduction-item__text special-deduction-item__text--sub">非独生子女：与兄弟姐妹分摊每月3000元额度，每人每月不超过1500元。</text>
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

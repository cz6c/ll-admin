<script lang="ts" setup>
import { computed, ref } from 'vue'
import {
  filterSalaryCities,
  groupSalaryCitiesByIndex,
  hotSalaryCityOptions,
  SALARY_INDEX_LETTERS,
} from '@/constants/salaryCityPicker'
import { useSalaryCalcStore } from '@/store/salaryCalc'
import { getCityProfile } from '@/utils/salaryCalculator'

defineOptions({ name: 'SalarySelectCity' })

definePage({
  style: {
    navigationBarTitleText: '选择城市',
  },
})

const store = useSalaryCalcStore()
const searchInput = ref('')
const searchKeyword = ref('')

const grouped = groupSalaryCitiesByIndex()
const hotList = hotSalaryCityOptions()

const filtered = computed(() => filterSalaryCities(searchKeyword.value))

const lettersWithData = computed(() =>
  SALARY_INDEX_LETTERS.filter(letter => (grouped[letter]?.length ?? 0) > 0),
)

function selectCity(id: string) {
  store.patchInput({ cityId: id })
  const city = getCityProfile(id)
  if (store.input.ssPaymentType === 'base') {
    const p = store.input.preTaxMonthly
    store.patchInput({ ssBase: Math.min(Math.max(p, city.ssBaseMin), city.ssBaseCap) })
  }
  if (store.input.hfPaymentType === 'base') {
    const p = store.input.preTaxMonthly
    store.patchInput({ hfBase: Math.min(Math.max(p, city.ssBaseMin), city.ssBaseCap) })
  }
  uni.navigateBack()
}

function onSearch({ value }: { value: string }) {
  searchKeyword.value = value.trim()
}

function onSearchClear() {
  searchKeyword.value = ''
}
</script>

<template>
  <view class="h-screen page-shell-white flex flex-col">
    <view class="shrink-0 px-24rpx pb-24rpx pt-16rpx">
      <wd-search
        v-model="searchInput"
        placeholder="请输入城市名（中文）"
        hide-cancel
        @search="onSearch"
        @clear="onSearchClear"
      />
    </view>

    <scroll-view v-if="searchKeyword" scroll-y class="city-select__scroll">
      <view v-if="filtered.length === 0" class="px-32rpx py-96rpx text-center text-28rpx text-#999">
        暂无匹配城市
      </view>
      <view
        v-for="c in filtered"
        :key="c.id"
        class="city-select__row"
        @click="selectCity(c.id)"
      >
        {{ c.name }}
      </view>
    </scroll-view>

    <wd-index-bar v-else class="city-select__scroll">
      <view class="px-24rpx pb-40rpx pt-8rpx">
        <text class="mb-24rpx block text-26rpx text-#666">
          热门城市
        </text>
        <view class="grid grid-cols-4 gap-20rpx">
          <view
            v-for="c in hotList"
            :key="c.id"
            class="city-select__hot-cell"
            @click="selectCity(c.id)"
          >
            {{ c.name }}
          </view>
        </view>
      </view>
      <template v-for="letter in lettersWithData" :key="letter">
        <wd-index-anchor :index="letter" />
        <view
          v-for="c in grouped[letter]"
          :key="c.id"
          class="city-select__row"
          @click="selectCity(c.id)"
        >
          {{ c.name }}
        </view>
      </template>
    </wd-index-bar>
  </view>
</template>

<style scoped lang="scss">
.city-select__scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.city-select__row {
  padding: 28rpx 32rpx;
  border-bottom: 2rpx solid #f0f0f0;
  font-size: 30rpx;
  color: #333;
  background: #fff;
}

.city-select__hot-cell {
  box-sizing: border-box;
  padding: 24rpx 12rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 16rpx;
  font-size: 26rpx;
  color: #333;
  text-align: center;
  background: #fff;
}
</style>

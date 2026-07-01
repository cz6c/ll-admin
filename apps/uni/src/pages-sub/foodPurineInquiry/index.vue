<script lang="ts" setup>
import { systemInfo } from '@/utils/systemInfo'
import data from './data.json'

defineOptions({ name: 'FoodPurineInquiry' })

type PurineLevel = keyof typeof data.purineLevels

interface Food {
  id: string
  name: string
  category: string
  purine: number
  level: PurineLevel
  image: string
  description: string
}

definePage({
  style: {
    navigationBarTitleText: '嘌呤含量查询',
  },
})

const foods = data.foods as Food[]
const categories = data.categories
const ALL_CATEGORY = '全部'
const tabCategories = [ALL_CATEGORY, ...categories]

const selectedCategory = ref(ALL_CATEGORY)
const searchInput = ref('')
const searchKeyword = ref('')
const showDetail = ref(false)
const selectedFood = ref<Food | null>(null)

const hasActiveFilter = computed(() => Boolean(searchKeyword.value))

const categoryCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const category of categories)
    counts.set(category, 0)
  for (const food of foods)
    counts.set(food.category, (counts.get(food.category) ?? 0) + 1)
  return counts
})

function getCategoryTotalCount(category: string) {
  if (category === ALL_CATEGORY)
    return foods.length
  return categoryCounts.value.get(category) ?? 0
}

function getFoodsByCategory(category: string) {
  const q = searchKeyword.value
  return foods
    .filter((food) => {
      const categoryMatch = category === ALL_CATEGORY || food.category === category
      const keywordMatch = !q || food.name.includes(q)
      return categoryMatch && keywordMatch
    })
    .sort((a, b) => a.purine - b.purine)
}

function getLevelLabel(level: PurineLevel) {
  return data.purineLevels[level]?.title ?? level
}

function levelTagType(level: PurineLevel): 'danger' | 'warning' | 'primary' | 'success' {
  const map: Record<PurineLevel, 'danger' | 'warning' | 'primary' | 'success'> = {
    very_high: 'danger',
    high: 'warning',
    medium: 'primary',
    low: 'success',
  }
  return map[level]
}

function levelValueClass(level: PurineLevel) {
  const map: Record<PurineLevel, string> = {
    very_high: 'text-#dc2626',
    high: 'text-#ea580c',
    medium: 'text-#ca8a04',
    low: 'text-#16a34a',
  }
  return map[level]
}

function openDetail(food: Food) {
  selectedFood.value = food
  showDetail.value = true
}

function onDetailClose() {
  selectedFood.value = null
}

function onSearch({ value }: { value: string }) {
  searchKeyword.value = value.trim()
}

function onSearchClear() {
  searchKeyword.value = ''
}

const windowHeight = computed(() => {
  let height = systemInfo.windowHeight - systemInfo.safeAreaInsets.bottom
  // #ifdef H5 || APP-PLUS
  height = height - 44
  // #endif
  // #ifndef H5 || APP-PLUS
  height = height - uni.getMenuButtonBoundingClientRect().bottom
  // #endif
  return height
})
</script>

<template>
  <view class="flex flex-col bg-page pb-safe" :style="{ height: `${windowHeight}px` }">
    <view class="shrink-0 p-24rpx">
      <wd-search
        v-model="searchInput"
        placeholder="搜索食物名称"
        hide-cancel
        variant="light"
        custom-class="search"
        @search="onSearch"
        @clear="onSearchClear"
      />
    </view>

    <view class="min-h-0 flex flex-1 flex-col">
      <wd-tabs
        v-model="selectedCategory"
        animated
        swipeable
        slidable="always"
        :map-num="8"
        map-title="食物分类"
        custom-class="food-tabs"
      >
        <wd-tab
          v-for="category in tabCategories"
          :key="category"
          :name="category"
          :title="category"
        />
      </wd-tabs>
      <scroll-view scroll-y class="min-h-0 flex-1" :show-scrollbar="false">
        <view class="p-16rpx">
          <view class="px-8rpx pb-16rpx">
            <text class="text-26rpx text-#999">
              {{
                hasActiveFilter
                  ? `找到 ${getFoodsByCategory(selectedCategory).length} 条`
                  : `共 ${getCategoryTotalCount(selectedCategory)} 条`
              }}
            </text>
          </view>

          <wd-empty
            v-if="getFoodsByCategory(selectedCategory).length === 0"
            :tip="hasActiveFilter ? '未找到匹配的食物，试试换个关键词' : '该分类暂无数据'"
          />

          <view v-else class="grid grid-cols-2 gap-16rpx">
            <view
              v-for="food in getFoodsByCategory(selectedCategory)"
              :key="food.id"
              class="box-border card-rounded p-24rpx"
              @click="openDetail(food)"
            >
              <view class="mb-8rpx flex items-start justify-between gap-8rpx">
                <view class="min-w-0 flex-1 text-28rpx text-#333 font-600 leading-snug">
                  {{ food.name }}
                </view>
                <wd-tag
                  :type="levelTagType(food.level)"
                  mark
                  variant="light"
                  size="medium"
                  custom-class="shrink-0"
                >
                  {{ getLevelLabel(food.level) }}
                </wd-tag>
              </view>
              <view class="mb-12rpx">
                <text class="text-48rpx font-700 tabular-nums" :class="levelValueClass(food.level)">
                  {{ food.purine }}
                </text>
                <text class="ml-4rpx text-24rpx text-#999">mg/100g</text>
              </view>
              <view class="line-clamp-2 text-24rpx text-#999 leading-relaxed">
                {{ food.description }}
              </view>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <wd-popup
      v-model="showDetail"
      position="center"
      :root-portal="true"
      closable
      @close="onDetailClose"
    >
      <view v-if="selectedFood" class="w-600rpx rounded-24rpx bg-white p-40rpx">
        <view class="mb-24rpx flex items-start justify-between gap-16rpx">
          <view class="min-w-0 flex-1 text-34rpx text-#333 font-600">
            {{ selectedFood.name }}
          </view>
          <wd-tag
            :type="levelTagType(selectedFood.level)"
            mark
            variant="light"
            custom-class="shrink-0"
          >
            {{ getLevelLabel(selectedFood.level) }}
          </wd-tag>
        </view>

        <wd-cell-group center border custom-class="card-rounded" :title-width="160">
          <wd-cell title="类别" :value="selectedFood.category" />
          <wd-cell title="嘌呤含量" :value="`${selectedFood.purine} mg/100g`" />
        </wd-cell-group>

        <view class="mt-24rpx text-28rpx text-#666 leading-relaxed">
          {{ selectedFood.description }}
        </view>
      </view>
    </wd-popup>
  </view>
</template>

<style scoped lang="scss">
:deep(.search) {
  padding: 0 !important;
  background: none !important;
}

$tab-map-gap: 16rpx;

:deep(.food-tabs) {
  --wot-tabs-map-nav-btn-gap: #{$tab-map-gap};
  --wot-tabs-map-nav-btn-font-size: 24rpx;
  --wot-tabs-map-nav-btn-line-height: 36rpx;
  --wot-tabs-map-nav-btn-padding: 16rpx 8rpx;
}

:deep(.food-tabs .wd-tabs__map-nav-item) {
  flex: 0 0 calc((100% - 2 * #{$tab-map-gap}) / 3);
  max-width: calc((100% - 2 * #{$tab-map-gap}) / 3);
  min-width: 0;
  margin-right: $tab-map-gap;
  margin-bottom: $tab-map-gap;

  &:nth-child(3n) {
    margin-right: 0;
  }
}

:deep(.food-tabs .wd-tabs__map-nav-btn) {
  display: block;
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>

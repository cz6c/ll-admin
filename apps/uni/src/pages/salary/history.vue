<script lang="ts" setup>
import type { SalaryHistoryEntry } from '@/utils/salaryHistoryEntry'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useQueue } from '@wot-ui/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import SalaryHistoryEntryRow from '@/components/SalaryHistoryEntryRow.vue'
import { useSalaryHistoryStore } from '@/store/salaryHistory'
import { formatPayPeriodLabel } from '@/utils/payPeriod'
import { mergeSalaryHistoryEntries } from '@/utils/salaryHistoryEntry'

defineOptions({ name: 'SalaryHistory' })

/** 统一历史列表：合并年薪测算与月薪核对，支持类型筛选与摘要搜索 */
const { closeOutside } = useQueue()

definePage({
  style: {
    navigationBarTitleText: '历史记录',
  },
})

/** 筛选胶囊：全部 / 测算 / 核对；与路由 ?tab= 对齐 */
type HistoryFilter = 'all' | 'calc' | 'verify'

/** 筛选胶囊配置；icon 为 wot-ui 图标名 */
const FILTERS: { value: HistoryFilter, label: string, icon: string }[] = [
  { value: 'all', label: '全部', icon: 'common' },
  { value: 'calc', label: '年薪测算', icon: 'file' },
  { value: 'verify', label: '月薪核对', icon: 'check-square' },
]

/** 搜索彩蛋：输入后进入工作台 */
const WORKBENCH_KEY = '1111'

const salaryHistoryStore = useSalaryHistoryStore()
const { items } = storeToRefs(salaryHistoryStore)

const activeFilter = ref<HistoryFilter>('all')
const searchInput = ref('')
const searchKeyword = ref('')

const unifiedList = computed(() => mergeSalaryHistoryEntries(items.value))

const filteredList = computed(() => {
  const byType = activeFilter.value === 'all'
    ? unifiedList.value
    : unifiedList.value.filter(item => item.kind === activeFilter.value)

  const q = searchKeyword.value.trim().toLowerCase()
  if (!q)
    return byType

  return byType.filter((item) => {
    return item.title.toLowerCase().includes(q)
      || item.subtitle.toLowerCase().includes(q)
  })
})

/** 一次拉全量后在本地按摘要/类型名过滤，避免功能名被服务端 keyword 误伤 */
async function refreshHistory() {
  await salaryHistoryStore.fetchHistory()
}

onLoad((options?: Record<string, string>) => {
  if (options?.tab === 'calc' || options?.tab === 'verify')
    activeFilter.value = options.tab
})

onShow(async () => {
  try {
    await refreshHistory()
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : '历史记录加载失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
})

function onSearch({ value }: { value: string }) {
  const val = value.trim()
  if (val === WORKBENCH_KEY) {
    searchInput.value = ''
    searchKeyword.value = ''
    uni.navigateTo({ url: '/pages/workbench/workbench' })
    return
  }
  searchKeyword.value = val
}

function onSearchClear() {
  searchKeyword.value = ''
}

function openItem(item: SalaryHistoryEntry) {
  uni.navigateTo({ url: item.url })
}

function confirmDelete(item: SalaryHistoryEntry) {
  const content = item.kind === 'calc'
    ? '确定删除这条年薪测算记录吗？'
    : `确定删除 ${formatPayPeriodLabel(item.payPeriod || '')} 的核对记录吗？`

  uni.showModal({
    title: '删除记录',
    content,
    async success(res) {
      if (!res.confirm)
        return
      try {
        await salaryHistoryStore.removeById(item.id)
        // 删接口不改 items：列表页自行再拉
        await refreshHistory()
        uni.showToast({ title: '已删除', icon: 'success' })
      }
      catch (err) {
        const msg = err instanceof Error ? err.message : '删除失败'
        uni.showToast({ title: msg, icon: 'none' })
      }
    },
  })
}
</script>

<template>
  <view class="page-shell pb-safe" @click="closeOutside">
    <view class="p-24rpx">
      <wd-search
        v-model="searchInput"
        placeholder="关键词"
        hide-cancel
        variant="light"
        custom-class="search mb-16rpx"
        @search="onSearch"
        @clear="onSearchClear"
      />

      <view class="mb-24rpx flex flex-wrap gap-16rpx">
        <view
          v-for="chip in FILTERS"
          :key="chip.value"
          class="history-chip"
          :class="activeFilter === chip.value ? 'history-chip--active' : ''"
          @click="activeFilter = chip.value"
        >
          <wd-icon
            :name="chip.icon"
            size="28rpx"
            :color="activeFilter === chip.value ? '#fff' : '#6b7280'"
          />
          <text>{{ chip.label }}</text>
        </view>
      </view>

      <wd-empty
        v-if="filteredList.length === 0"
        :tip="!searchKeyword && activeFilter === 'all' ? '暂无历史记录' : '未找到匹配的历史记录'"
      />

      <view v-else class="card-rounded overflow-hidden">
        <wd-swipe-action
          v-for="(item, idx) in filteredList"
          :key="item.key"
        >
          <SalaryHistoryEntryRow
            :title="item.title"
            :subtitle="item.subtitle"
            :theme="item.theme"
            :icon="item.icon"
            :bordered="idx < filteredList.length - 1"
            @click="openItem(item)"
          />

          <template #right>
            <view class="h-full flex">
              <view
                class="history-swipe-del box-border h-full min-h-144rpx center px-40rpx"
                @click.stop="confirmDelete(item)"
              >
                <text class="text-28rpx text-white">
                  删除
                </text>
              </view>
            </view>
          </template>
        </wd-swipe-action>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
:deep(.search) {
  padding: 0 !important;
  background: none !important;
}

.history-chip {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 24rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: #6b7280;
  background: #fff;
  border: 2rpx solid #e5e7eb;
}

.history-chip--active {
  color: #fff;
  background: var(--wot-primary-6);
  border-color: var(--wot-primary-6);
}

.history-swipe-del {
  background: var(--wot-danger-main);
}
</style>

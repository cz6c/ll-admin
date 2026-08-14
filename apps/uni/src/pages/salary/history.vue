<script lang="ts" setup>
/**
 * 单类型历史记录（核对或测算）
 * 主流程：?tab=verify|calc 锁定类型 → 拉全量本地过滤/搜索 → 滑动删除
 * 入口目前仅测算页（核对历史入口暂关）；不做「全部」与类型切换
 */
import type { SalaryHistoryEntry, SalaryHistoryEntryKind } from '@/utils/salaryHistoryEntry'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useQueue } from '@wot-ui/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import SalaryLionEmpty from '@/components/salary/SalaryLionEmpty.vue'
import SalaryHistoryEntryRow from '@/components/SalaryHistoryEntryRow.vue'
import { hasPrivacyAgreed, PRIVACY_GATE_PATH, setPrivacyReturnPath } from '@/constants/privacy'
import { useSalaryHistoryStore } from '@/store/salaryHistory'
import { formatPayPeriodLabel } from '@/utils/payPeriod'
import { mergeSalaryHistoryEntries } from '@/utils/salaryHistoryEntry'

defineOptions({ name: 'SalaryHistory' })

const { closeOutside } = useQueue()

definePage({
  style: {
    navigationBarTitleText: '核对记录',
    // 禁止页面级滚动，只允许下方 scroll-view 滚动（避免 header 跟着跑）
    disableScroll: true,
  },
})

/** 路由锁定的记录类型；缺省 verify，避免误进「全部」 */
type HistoryTab = SalaryHistoryEntryKind

/** 搜索彩蛋：输入后进入工作台 */
const WORKBENCH_KEY = '1111'

const salaryHistoryStore = useSalaryHistoryStore()
const { items } = storeToRefs(salaryHistoryStore)

const activeTab = ref<HistoryTab>('verify')
const searchInput = ref('')
const searchKeyword = ref('')

/** 系统默认下拉刷新触发态 */
const refresherTriggered = ref(false)

const pageTitle = computed(() => (activeTab.value === 'calc' ? '测算记录' : '核对记录'))

const searchPlaceholder = computed(() =>
  activeTab.value === 'calc' ? '搜金额或结果' : '搜月份、金额或结果',
)

const unifiedList = computed(() => mergeSalaryHistoryEntries(items.value))

const typedList = computed(() =>
  unifiedList.value.filter(item => item.kind === activeTab.value),
)

const filteredList = computed(() => {
  const q = searchKeyword.value.trim().toLowerCase()
  if (!q)
    return typedList.value

  return typedList.value.filter((item) => {
    const kindLabel = item.kind === 'calc' ? '年薪测算' : '月薪核对'
    return item.title.toLowerCase().includes(q)
      || item.subtitle.toLowerCase().includes(q)
      || item.emphasis.toLowerCase().includes(q)
      || kindLabel.includes(q)
  })
})

/** 当前类型真空仓 */
const isTypeEmpty = computed(() => typedList.value.length === 0)

/** 列表空态：类型真空引导主流程；搜索无结果不展示 CTA */
const listEmpty = computed(() => {
  if (isTypeEmpty.value) {
    if (activeTab.value === 'calc') {
      return {
        show: true,
        title: '还没有测算记录',
        desc: '输入月薪，一键估算全年到手',
        showAction: false,
      }
    }
    return {
      show: true,
      title: '还没有核对记录',
      desc: '发工资条了？我在这儿帮你算清楚',
      showAction: true,
    }
  }
  if (filteredList.value.length === 0) {
    return {
      show: true,
      title: '没有找到相关记录',
      desc: '换个关键词试试',
      showAction: false,
    }
  }
  return { show: false, title: '', desc: '', showAction: false }
})

/** 搜索变更时列表短淡入（≤150ms） */
const listEnterKey = computed(() => `${activeTab.value}|${searchKeyword.value}`)

async function refreshHistory() {
  await salaryHistoryStore.fetchHistory()
}

function applyTab(tab: HistoryTab) {
  activeTab.value = tab
  uni.setNavigationBarTitle({ title: pageTitle.value })
}

onLoad((options?: Record<string, string>) => {
  applyTab(options?.tab === 'calc' ? 'calc' : 'verify')
})

onShow(async () => {
  if (!hasPrivacyAgreed()) {
    setPrivacyReturnPath(`/pages/salary/history?tab=${activeTab.value}`)
    uni.redirectTo({ url: PRIVACY_GATE_PATH })
    return
  }
  uni.setNavigationBarTitle({ title: pageTitle.value })
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

async function onRefresherRefresh() {
  refresherTriggered.value = true
  try {
    await refreshHistory()
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : '历史记录加载失败'
    uni.showToast({ title: msg, icon: 'none' })
  }
  finally {
    refresherTriggered.value = false
  }
}
</script>

<template>
  <page-meta page-style="overflow: hidden;" />

  <view class="history-page page-shell" @click="closeOutside">
    <view class="history-page__header">
      <wd-search
        v-model="searchInput"
        :placeholder="searchPlaceholder"
        hide-cancel
        variant="light"
        custom-class="search mb-16rpx"
        @search="onSearch"
        @clear="onSearchClear"
      />
    </view>

    <scroll-view
      class="history-page__scroll"
      scroll-y
      refresher-enabled
      :refresher-triggered="refresherTriggered"
      @refresherrefresh="onRefresherRefresh"
    >
      <view class="history-page__list">
        <SalaryLionEmpty
          v-if="listEmpty.show"
          :title="listEmpty.title"
          :desc="listEmpty.desc"
          :show-action="listEmpty.showAction"
        />

        <view
          v-else
          :key="listEnterKey"
          class="history-page__cards"
        >
          <view
            v-for="item in filteredList"
            :key="item.key"
            class="history-page__swipe"
          >
            <wd-swipe-action>
              <SalaryHistoryEntryRow
                :title="item.title"
                :subtitle="item.subtitle"
                :emphasis="item.emphasis"
                :emphasis-tone="item.emphasisTone"
                @click="openItem(item)"
              />

              <template #right>
                <view class="h-full flex">
                  <view
                    class="history-swipe-del box-border h-full min-h-144rpx center px-40rpx"
                    hover-class="history-swipe-del--pressed"
                    :hover-stay-time="60"
                    @click.stop="confirmDelete(item)"
                  >
                    <text class="text-28rpx text-white font-600">
                      删除
                    </text>
                  </view>
                </view>
              </template>
            </wd-swipe-action>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<style scoped lang="scss">
/* 定高锁死页面内容区：header 不参与滚动，只有下方 scroll-view 滚。
 * 用 absolute 而非 fixed：微信 fixed 相对屏幕，会盖住原生导航栏。 */
.history-page {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  background: #f5f6f8;
}

.history-page__header {
  flex-shrink: 0;
  padding: 24rpx 24rpx 0;
  background: #f5f6f8;
  z-index: 2;
}

.history-page__scroll {
  flex: 1;
  height: 0;
  width: 100%;
  min-height: 0;
  background: #f5f6f8;
}

.history-page__list {
  padding: 8rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
}

.history-page__cards {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  animation: history-list-in 140ms var(--ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)) both;
}

.history-page__swipe {
  border-radius: 20rpx;
  overflow: hidden;
}

:deep(.search) {
  padding: 0 !important;
  background: none !important;
}

.history-swipe-del {
  background: var(--wot-danger-main);
  transition:
    transform 100ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 100ms cubic-bezier(0.23, 1, 0.32, 1);
}

.history-swipe-del--pressed {
  transform: scale(0.97);
  opacity: 0.88;
}

@keyframes history-list-in {
  from {
    opacity: 0.72;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .history-page__cards {
    animation: none;
  }
}
</style>

<script lang="ts" setup>
/**
 * 全部记录（测算 + 核对）
 * 主流程：拉全量 → 本地筛选/搜索 → 卡片列表滑动删除；真空仓引导核对
 */
import type { SalaryHistoryEntry } from '@/utils/salaryHistoryEntry'
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

/** 统一历史列表：合并年薪测算与月薪核对，支持类型筛选与摘要搜索 */
const { closeOutside } = useQueue()

definePage({
  style: {
    // 与首页「全部记录」入口对齐，便于跨页 wayfinding
    navigationBarTitleText: '全部记录',
    // 禁止页面级滚动，只允许下方 scroll-view 滚动（避免 header 跟着跑）
    disableScroll: true,
  },
})

/** 筛选胶囊：全部 / 测算 / 核对；与路由 ?tab= 对齐 */
type HistoryFilter = 'all' | 'calc' | 'verify'

/** 筛选文案缩短；行内已有类型胶囊，不再放图标减噪 */
const FILTERS: { value: HistoryFilter, label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'calc', label: '测算' },
  { value: 'verify', label: '核对' },
]

/** 搜索彩蛋：输入后进入工作台 */
const WORKBENCH_KEY = '1111'

const salaryHistoryStore = useSalaryHistoryStore()
const { items } = storeToRefs(salaryHistoryStore)

const activeFilter = ref<HistoryFilter>('all')
const searchInput = ref('')
const searchKeyword = ref('')

/** 系统默认下拉刷新触发态 */
const refresherTriggered = ref(false)

const unifiedList = computed(() => mergeSalaryHistoryEntries(items.value))

const filteredList = computed(() => {
  const byType = activeFilter.value === 'all'
    ? unifiedList.value
    : unifiedList.value.filter(item => item.kind === activeFilter.value)

  const q = searchKeyword.value.trim().toLowerCase()
  if (!q)
    return byType

  return byType.filter((item) => {
    const kindLabel = item.kind === 'calc' ? '年薪测算' : '月薪核对'
    return item.title.toLowerCase().includes(q)
      || item.subtitle.toLowerCase().includes(q)
      || item.emphasis.toLowerCase().includes(q)
      || kindLabel.includes(q)
  })
})

/** 真空仓：无任何记录 */
const isWarehouseEmpty = computed(() => unifiedList.value.length === 0)

/** 列表空态：真空仓引导核对；筛选/搜索无结果不展示 CTA */
const listEmpty = computed(() => {
  if (isWarehouseEmpty.value) {
    return {
      show: true,
      title: '还没有记录',
      desc: '发工资条了？我在这儿帮你算清楚',
      showAction: true,
    }
  }
  if (filteredList.value.length === 0) {
    return {
      show: true,
      title: '没有找到相关记录',
      desc: '换个关键词，或试试别的筛选',
      showAction: false,
    }
  }
  return { show: false, title: '', desc: '', showAction: false }
})

/** 筛选切换时列表短淡入（≤150ms），高频切换不加重动画 */
const listEnterKey = computed(() => `${activeFilter.value}|${searchKeyword.value}`)

/** 一次拉全量后在本地按摘要/类型名过滤，避免功能名被服务端 keyword 误伤 */
async function refreshHistory() {
  await salaryHistoryStore.fetchHistory()
}

function setFilter(value: HistoryFilter) {
  activeFilter.value = value
}

onLoad((options?: Record<string, string>) => {
  if (options?.tab === 'calc' || options?.tab === 'verify')
    activeFilter.value = options.tab
})

onShow(async () => {
  if (!hasPrivacyAgreed()) {
    setPrivacyReturnPath('/pages/salary/history')
    uni.redirectTo({ url: PRIVACY_GATE_PATH })
    return
  }
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
  <!-- page-meta：双保险禁掉页面滚动（部分端 disableScroll 不生效） -->
  <page-meta page-style="overflow: hidden;" />

  <view class="history-page page-shell" @click="closeOutside">
    <!-- 顶栏在 scroll-view 外，flex-shrink:0，固定不滚；与页底同灰，白卡只给内容 -->
    <view class="history-page__header">
      <wd-search
        v-model="searchInput"
        placeholder="搜月份、金额或结果"
        hide-cancel
        variant="light"
        custom-class="search mb-16rpx"
        @search="onSearch"
        @clear="onSearchClear"
      />

      <view class="history-page__chips">
        <view
          v-for="chip in FILTERS"
          :key="chip.value"
          class="history-chip"
          :class="activeFilter === chip.value ? 'history-chip--active' : ''"
          hover-class="history-chip--pressed"
          :hover-stay-time="60"
          @click="setFilter(chip.value)"
        >
          <text>{{ chip.label }}</text>
        </view>
      </view>
    </view>

    <!--
      flex:1 + height:0：占满剩余高度，小程序 scroll-view 必须有确定高度才能内部滚动；
      不再用 windowHeight − 实测 header，避免初始 0 导致整页溢出、header 跟着滚。
    -->
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
                :kind="item.kind"
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

.history-page__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 16rpx;
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

/* 筛选/搜索变更时短淡入，不拖慢手感 */
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

/* 未选：浅底无描边；选中：主色实心 —— 靠填充区分，去掉硬描边 */
.history-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
  letter-spacing: 0.01em;
  color: #6b7280;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  transition: transform 100ms cubic-bezier(0.23, 1, 0.32, 1);
}

.history-chip--active {
  color: #fff;
  font-weight: 500;
  background: var(--wot-primary-6);
}

.history-chip--pressed {
  transform: scale(0.96);
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

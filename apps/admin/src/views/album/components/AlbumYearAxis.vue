<!--
  相册年份-月份轴
  职责：展示当前筛选结果里有照片的年份和月份，高亮可视区对应项，点击把起点下标交给页面去滚
  适用：本地相册宫格左侧。不持有滚动容器，不改父级列表
-->
<script setup lang="ts">
import type { AlbumAxisYear } from "../albumYearAxis";

defineOptions({ name: "AlbumYearAxis" });

const props = defineProps<{
  years: AlbumAxisYear[];
  /** 可视区第一张所在年 */
  activeYearKey: string;
  /** 可视区第一张所在月；未知年为空 */
  activeMonthKey: string;
}>();

const emit = defineEmits<{
  /** 跳到该年或该月的第一张 */
  select: [startIndex: number];
}>();

const rootEl = ref<HTMLElement | null>(null);

/** 轴内需要跟滚的是当前月；该年没有月份命中时跟年份 */
function isScrollAnchor(yearKey: string, monthKey?: string): boolean {
  if (monthKey) return monthKey === props.activeMonthKey;
  return yearKey === props.activeYearKey && !props.activeMonthKey;
}

watch(
  () => [props.activeYearKey, props.activeMonthKey] as const,
  () => {
    nextTick(() => {
      rootEl.value?.querySelector<HTMLElement>("[data-axis-anchor='true']")?.scrollIntoView({ block: "nearest" });
    });
  }
);
</script>

<template>
  <nav ref="rootEl" class="year-axis" aria-label="拍摄时间">
    <div v-for="year in years" :key="year.key" class="year-block">
      <button
        type="button"
        class="year-btn"
        :class="{ 'is-active': year.key === activeYearKey }"
        :aria-current="year.key === activeYearKey ? 'true' : undefined"
        :data-axis-anchor="isScrollAnchor(year.key) ? 'true' : undefined"
        @click="emit('select', year.startIndex)"
      >
        {{ year.label }}
      </button>
      <button
        v-for="month in year.months"
        :key="month.key"
        type="button"
        class="month-btn"
        :class="{ 'is-active': month.key === activeMonthKey }"
        :aria-current="month.key === activeMonthKey ? 'true' : undefined"
        :data-axis-anchor="isScrollAnchor(year.key, month.key) ? 'true' : undefined"
        @click="emit('select', month.startIndex)"
      >
        {{ month.label }}
      </button>
    </div>
  </nav>
</template>

<style scoped lang="scss">
.year-axis {
  flex: 0 0 72px;
  width: 72px;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 0;
  border-right: 1px solid var(--border-color);
  background: var(--bg-color);

  &::-webkit-scrollbar {
    width: 0;
  }
}

.year-block + .year-block {
  margin-top: 4px;
}

.year-btn,
.month-btn {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: center;
  color: var(--color-text-tertiary);

  &:hover {
    color: var(--color-text);
  }

  &.is-active {
    color: var(--color-primary);
    font-weight: 600;
  }
}

.year-btn {
  padding: 6px 0;
  font-size: 13px;
  line-height: 1.4;
}

.month-btn {
  padding: 2px 0 2px 8px;
  font-size: 12px;
  line-height: 1.5;
}
</style>

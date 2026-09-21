<!--
  相册年份轴
  职责：展示当前筛选结果里有照片的年份，高亮可视区对应年，点击把年份 key 交给页面挂载/滚动
  适用：本地相册宫格左侧。不持有滚动容器，不改父级列表
-->
<script setup lang="ts">
import type { AlbumAxisYear } from "../albumYearAxis";

defineOptions({ name: "AlbumYearAxis" });

const props = defineProps<{
  years: AlbumAxisYear[];
  /** 可视区对应年 */
  activeYearKey: string;
}>();

const emit = defineEmits<{
  select: [yearKey: string];
}>();

const rootEl = ref<HTMLElement | null>(null);

watch(
  () => props.activeYearKey,
  () => {
    nextTick(() => {
      rootEl.value?.querySelector<HTMLElement>("[data-axis-anchor='true']")?.scrollIntoView({ block: "nearest" });
    });
  }
);
</script>

<template>
  <nav ref="rootEl" class="year-axis" aria-label="拍摄年份">
    <button
      v-for="year in years"
      :key="year.key"
      type="button"
      class="year-btn"
      :class="{ 'is-active': year.key === activeYearKey }"
      :aria-current="year.key === activeYearKey ? 'true' : undefined"
      :data-axis-anchor="year.key === activeYearKey ? 'true' : undefined"
      @click="emit('select', year.key)"
    >
      {{ year.label }}
    </button>
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

.year-btn {
  display: block;
  width: 100%;
  margin: 0;
  padding: 6px 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: center;
  font-size: 13px;
  line-height: 1.4;
  color: var(--color-text-tertiary);

  &:hover {
    color: var(--color-text);
  }

  &.is-active {
    color: var(--color-primary);
    font-weight: 600;
  }
}
</style>

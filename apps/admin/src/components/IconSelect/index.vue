<script setup lang="ts">
/**
 * Iconify 图标选择器
 * 职责：分页浏览 ant-design 图标集，写入 `ant-design:name` 字符串
 */
import { IconJson } from "./data";
import { cloneDeep } from "lodash-es";
import type { CSSProperties } from "vue";

type ParameterCSSProperties = (item?: string) => CSSProperties | undefined;

defineOptions({
  name: "IconSelect"
});

const PREFIX = "ant-design:";

const inputValue = defineModel({ type: String });

const icon = ref("");
/** 分类后缀：outlined / filled / twotone */
const currentActiveType = ref("outlined");
const copyIconList = cloneDeep(IconJson[PREFIX] as string[]);
const totalPage = ref(0);
const pageSize = ref(35);
const currentPage = ref(1);
const filterValue = ref("");

const tabsList = [
  { label: "线框", name: "outlined" },
  { label: "实底", name: "filled" },
  { label: "双色", name: "twotone" }
];

const filteredList = computed(() =>
  copyIconList.filter(
    i => i.endsWith(`-${currentActiveType.value}`) && i.toLowerCase().includes(filterValue.value.toLowerCase())
  )
);

const pageList = computed(() =>
  filteredList.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value)
);

const iconItemStyle = computed((): ParameterCSSProperties => {
  return item => {
    if (inputValue.value === PREFIX + item) {
      return {
        borderColor: "var(--color-primary)",
        color: "var(--color-primary)"
      };
    }
  };
});

function setVal() {
  const val = inputValue.value || "";
  if (val.startsWith(PREFIX)) {
    icon.value = val.slice(PREFIX.length);
  } else {
    icon.value = val.includes(":") ? val.slice(val.indexOf(":") + 1) : val;
  }
  if (icon.value.endsWith("-filled")) currentActiveType.value = "filled";
  else if (icon.value.endsWith("-twotone")) currentActiveType.value = "twotone";
  else currentActiveType.value = "outlined";
}

function onBeforeEnter() {
  setVal();
  const curIconIndex = filteredList.value.findIndex(i => i === icon.value);
  if (curIconIndex !== -1) currentPage.value = Math.ceil((curIconIndex + 1) / pageSize.value);
}

function onOpenChange(open: boolean) {
  if (open) onBeforeEnter();
  else filterValue.value = "";
}

function handleTabChange(key: string | number) {
  currentPage.value = 1;
  currentActiveType.value = String(key);
}

function onChangeIcon(item: string) {
  icon.value = item;
  inputValue.value = PREFIX + item;
}

function onCurrentChange(page: number) {
  currentPage.value = page;
}

function onClear() {
  icon.value = "";
  inputValue.value = "";
}

watch(
  () => filteredList.value,
  list => {
    totalPage.value = list.length;
  },
  { immediate: true }
);
watch(
  () => inputValue.value,
  val => val && setVal(),
  { immediate: true }
);
watch(
  () => filterValue.value,
  () => (currentPage.value = 1)
);
</script>

<template>
  <div class="selector">
    <a-input v-model:value="inputValue" disabled>
      <template #addonAfter>
        <a-popover :overlay-style="{ width: '372px' }" trigger="click" placement="bottom" @open-change="onOpenChange">
          <div class="w-8 h-8 cursor-pointer flex justify-center items-center">
            <IconifyIcon v-if="!icon" icon="ant-design:file-search-outlined" />
            <IconifyIcon v-else :icon="inputValue" />
          </div>
          <template #content>
            <a-input v-model:value="filterValue" class="px-2 pt-2" placeholder="搜索图标" allow-clear />
            <a-tabs v-model:active-key="currentActiveType" @change="handleTabChange">
              <a-tab-pane v-for="pane in tabsList" :key="pane.name" :tab="pane.label">
                <div class="icon-scroll">
                  <ul class="flex flex-wrap px-2! ml-2!">
                    <li
                      v-for="(item, key) in pageList"
                      :key="key"
                      :title="item"
                      class="icon-item p-2 cursor-pointer mr-2 mt-1 flex justify-center items-center border border-solid border-[#e5e7eb]"
                      :style="iconItemStyle(item)"
                      @click="onChangeIcon(item)"
                    >
                      <IconifyIcon :icon="PREFIX + item" width="20px" height="20px" />
                    </li>
                  </ul>
                  <a-empty v-show="pageList.length === 0" :description="`${filterValue} 图标不存在`" :image-style="{ height: '60px' }" />
                </div>
              </a-tab-pane>
            </a-tabs>
            <div class="w-full h-9 flex items-center overflow-auto border-t border-[#e5e7eb]">
              <a-pagination
                class="flex-auto ml-2"
                size="small"
                :total="totalPage"
                :current="currentPage"
                :page-size="pageSize"
                :show-size-changer="false"
                @change="onCurrentChange"
              />
              <a-button class="justify-end mx-2!" type="primary" danger size="small" @click="onClear">清空</a-button>
            </div>
          </template>
        </a-popover>
      </template>
    </a-input>
  </div>
</template>

<style lang="scss" scoped>
.icon-scroll {
  height: 220px;
  overflow: auto;
}
.icon-item {
  transition:
    color var(--dur-press) var(--ease-out),
    border-color var(--dur-press) var(--ease-out),
    transform var(--dur-press) var(--ease-out);

  &:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
    transform: scaleX(1.05);
  }
}

@media (prefers-reduced-motion: reduce) {
  .icon-item {
    transition: none;

    &:hover {
      transform: none;
    }
  }
}
</style>

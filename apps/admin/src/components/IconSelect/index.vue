<script setup lang="ts">
import { IconJson } from "./data";
import { cloneDeep } from "lodash-es";
import { CSSProperties } from "vue";

type ParameterCSSProperties = (item?: string) => CSSProperties | undefined;

defineOptions({
  name: "IconSelect"
});

const inputValue = defineModel({ type: String });

const icon = ref();
const currentActiveType = ref("ep:");
// 深拷贝图标数据，前端做搜索
const copyIconList = cloneDeep(IconJson);
const totalPage = ref(0);
// 每页显示35个图标
const pageSize = ref(35);
const currentPage = ref(1);

// 搜索条件
const filterValue = ref("");

const tabsList = [
  {
    label: "Element Plus",
    name: "ep:"
  },
  {
    label: "Remix Icon",
    name: "ri:"
  }
];

const pageList = computed(() =>
  copyIconList[currentActiveType.value]
    .filter(i => i.includes(filterValue.value))
    .slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value)
);

const iconItemStyle = computed((): ParameterCSSProperties => {
  return item => {
    if (inputValue.value === currentActiveType.value + item) {
      return {
        borderColor: "var(--el-color-primary)",
        color: "var(--el-color-primary)"
      };
    }
  };
});

function setVal() {
  currentActiveType.value = inputValue.value.substring(0, inputValue.value.indexOf(":") + 1) || tabsList[0].name;
  icon.value = inputValue.value.substring(inputValue.value.indexOf(":") + 1);
}

function onBeforeEnter() {
  setVal();
  // 寻找当前图标在第几页
  const curIconIndex = copyIconList[currentActiveType.value].findIndex(i => i === icon.value);
  if (curIconIndex !== -1) currentPage.value = Math.ceil((curIconIndex + 1) / pageSize.value);
}

function onAfterLeave() {
  filterValue.value = "";
}

function handleClick({ props }) {
  currentPage.value = 1;
  currentActiveType.value = props.name;
}

function onChangeIcon(item) {
  icon.value = item;
  inputValue.value = currentActiveType.value + item;
}

function onCurrentChange(page) {
  currentPage.value = page;
}

function onClear() {
  icon.value = "";
  inputValue.value = "";
}

watch(
  () => pageList.value,
  () => (totalPage.value = copyIconList[currentActiveType.value].filter(i => i.includes(filterValue.value)).length),
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
    <el-input v-model="inputValue" disabled>
      <template #append>
        <el-popover
          :width="372"
          trigger="click"
          popper-class="pure-popper"
          :popper-options="{
            placement: 'auto'
          }"
          @before-enter="onBeforeEnter"
        >
          <template #reference>
            <div class="w-8 h-8 cursor-pointer flex justify-center items-center">
              <IconifyIcon v-if="!icon" icon="ri:search-eye-line" />
              <IconifyIcon v-else :icon="inputValue" />
            </div>
          </template>

          <el-input v-model="filterValue" class="px-2 pt-2" placeholder="搜索图标" clearable />
          <el-tabs v-model="currentActiveType" @tab-click="handleClick">
            <el-tab-pane v-for="(pane, index) in tabsList" :key="index" :label="pane.label" :name="pane.name">
              <el-scrollbar height="220px">
                <ul class="flex flex-wrap px-2! ml-2!">
                  <li
                    v-for="(item, key) in pageList"
                    :key="key"
                    :title="item"
                    class="icon-item p-2 cursor-pointer mr-2 mt-1 flex justify-center items-center border border-solid border-[#e5e7eb]"
                    :style="iconItemStyle(item)"
                    @click="onChangeIcon(item)"
                  >
                    <IconifyIcon :icon="currentActiveType + item" width="20px" height="20px" />
                  </li>
                </ul>
                <el-empty v-show="pageList.length === 0" :description="`${filterValue} 图标不存在`" :image-size="60" />
              </el-scrollbar>
            </el-tab-pane>
          </el-tabs>
          <div class="w-full h-9 flex items-center overflow-auto border-t border-[#e5e7eb]">
            <el-pagination
              class="flex-auto ml-2"
              :total="totalPage"
              :current-page="currentPage"
              :page-size="pageSize"
              :pager-count="5"
              layout="pager"
              background
              size="small"
              @current-change="onCurrentChange"
            />
            <el-button class="justify-end mx-2!" type="danger" size="small" text bg @click="onClear"> 清空 </el-button>
          </div>
        </el-popover>
      </template>
    </el-input>
  </div>
</template>

<style lang="scss" scoped>
.icon-item {
  &:hover {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary);
    transform: scaleX(1.05);
    transition: all 0.4s;
  }
}
</style>

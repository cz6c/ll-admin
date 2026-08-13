<script setup lang="ts">
import type { SearchFormItem } from "./type";
import { BreakPoint } from "@/components/Grid/type";
import FormItem from "./components/FormItem.vue";
import Grid from "@/components/Grid/index.vue";
import GridItem from "@/components/Grid/components/GridItem.vue";
import { useRenderIcon } from "@/hooks/useRenderIcon";
import { cloneDeep } from "lodash-es";

defineOptions({
  name: "SearchForm"
});

export interface SearchFormProps {
  columns: SearchFormItem[]; // 搜索配置列
  searchCol?: Record<BreakPoint, number>;
  labelWidth?: string | number;
}

// 默认值
const props = withDefaults(defineProps<SearchFormProps>(), {
  searchCol: () => ({ xs: 1, sm: 2, md: 2, lg: 3, xl: 4 }),
  labelWidth: 80
});

const searchParam = defineModel<{ [key: string]: any }>({ required: true }); // 表单参数

const initilaData = cloneDeep(searchParam.value);

const $emit = defineEmits(["search", "reset"]);

// 是否默认折叠搜索项
const collapsed = ref(true);

// 获取响应式断点
const gridRef = ref();
const breakPoint = computed<BreakPoint>(() => gridRef.value?.breakPoint);

/** label 固定宽度 → ant Form labelCol.style */
function toLabelCol(width: string | number | undefined) {
  if (width == null || width === "") return undefined;
  const w = typeof width === "number" ? `${width}px` : String(width);
  return { style: { width: w } };
}

// 判断是否显示 展开/合并 按钮
const showCollapse = computed(() => {
  let show = false;
  props.columns.reduce((prev, current) => {
    prev += (current?.span ?? 1) + (current?.offset ?? 0);
    if (typeof props.searchCol !== "number") {
      if (prev >= props.searchCol[breakPoint.value]) show = true;
    } else {
      if (prev >= props.searchCol) show = true;
    }
    return prev;
  }, 0);
  return show;
});

/**
 * @description: 重置搜索数据
 */
const reset = () => {
  Object.keys(searchParam.value).forEach(key => {
    searchParam.value[key] = initilaData[key];
  });
  $emit("reset");
};
</script>
<template>
  <a-form
    v-if="columns.length"
    ref="formRef"
    class="search-form"
    :model="searchParam"
    layout="horizontal"
    :label-col="toLabelCol(labelWidth)"
    colon
    v-bind="$attrs"
  >
    <Grid ref="gridRef" :collapsed="collapsed" :gap="[20, 0]" :cols="searchCol">
      <GridItem v-for="(item, index) in columns" :key="item.prop" v-bind="item" :index="index">
        <a-form-item :name="item.prop" :label="item.label" :label-col="item.itemLabelWidth ? toLabelCol(item.itemLabelWidth) : undefined">
          <FormItem v-model="searchParam" :column="item" />
        </a-form-item>
      </GridItem>
      <GridItem suffix>
        <div class="operation">
          <a-space>
            <a-button type="primary" @click="$emit('search')">
              <template #icon>
                <component :is="useRenderIcon('ant-design:search-outlined')" />
              </template>
              搜索
            </a-button>
            <a-button @click="reset()">
              <template #icon>
                <component :is="useRenderIcon('ant-design:reload-outlined')" />
              </template>
              重置
            </a-button>
            <a-button v-if="showCollapse" type="link" class="search-isOpen" @click="collapsed = !collapsed">
              {{ collapsed ? "展开" : "合并" }}
              <IconifyIcon class="collapse-icon" :icon="collapsed ? 'ant-design:down-outlined' : 'ant-design:up-outlined'" />
            </a-button>
          </a-space>
        </div>
      </GridItem>
    </Grid>
  </a-form>
</template>
<style lang="scss" scoped>
.search-form {
  :deep(.ant-form-item-control-input-content) > * {
    width: 100%;
  }
}

.operation {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 18px;
}

.collapse-icon {
  margin-left: 4px;
}
</style>

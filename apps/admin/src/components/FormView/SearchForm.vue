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
  labelWidth: 120
});

const searchParam = defineModel<{ [key: string]: any }>({ required: true }); // 表单参数

const initilaData = cloneDeep(searchParam.value);

const $emit = defineEmits(["search", "reset"]);

// 是否默认折叠搜索项
const collapsed = ref(true);

// 获取响应式断点
const gridRef = ref();
const breakPoint = computed<BreakPoint>(() => gridRef.value?.breakPoint);

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
  <el-form v-if="columns.length" ref="formRef" :model="searchParam" label-suffix="：" v-bind="$attrs">
    <Grid ref="gridRef" :collapsed="collapsed" :gap="[20, 0]" :cols="searchCol">
      <GridItem v-for="(item, index) in columns" :key="item.prop" v-bind="item" :index="index">
        <el-form-item :prop="item.prop" :label="item.label" :labelWidth="item.itemLabelWidth || props.labelWidth">
          <FormItem v-model="searchParam" :column="item" />
        </el-form-item>
      </GridItem>
      <GridItem suffix>
        <div class="operation">
          <el-button type="primary" :icon="useRenderIcon('ep:search')" @click="$emit('search')">搜索</el-button>
          <el-button :icon="useRenderIcon('ep:refresh')" @click="reset()">重置</el-button>
          <el-button v-if="showCollapse" type="primary" link class="search-isOpen" @click="collapsed = !collapsed">
            {{ collapsed ? "展开" : "合并" }}
            <IconifyIcon class="el-icon--right" :icon="collapsed ? 'ep:arrow-down' : 'ep:arrow-up'" />
          </el-button>
        </div>
      </GridItem>
    </Grid>
  </el-form>
</template>
<style lang="scss" scoped>
.el-form {
  .el-form-item__content > * {
    width: 100%;
  }

  // 去除时间选择器上下 padding
  .el-range-editor.el-input__wrapper {
    padding: 0 10px;
  }
}

.operation {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 18px;
}
</style>

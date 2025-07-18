<!-- eslint-disable vue/no-mutating-props -->
<template>
  <template v-if="column?.el === 'input'">
    <el-input v-bind="{ ...(column?.props || {}), ...placeholder, clearable }" v-model="searchParam[handleProp(column.prop)]" />
  </template>
  <template v-if="column?.el === 'input-number'">
    <el-input-number v-bind="{ ...(column?.props || {}), ...placeholder, clearable }" v-model="searchParam[handleProp(column.prop)]" />
  </template>
  <template v-if="column?.el === 'select'">
    <el-select v-bind="{ ...(column?.props || {}), ...placeholder, clearable }" v-model="searchParam[handleProp(column.prop)]">
      <el-option v-for="(col, index) in column.options" :key="index" :label="col['label']" :value="col['value']" />
    </el-select>
  </template>
  <template v-if="column?.el === 'select-v2'">
    <el-select-v2 v-bind="{ ...(column?.props || {}), ...placeholder, clearable }" v-model="searchParam[handleProp(column.prop)]" :options="column.options" />
  </template>
  <template v-if="column?.el === 'tree-select'">
    <el-tree-select v-bind="{ ...(column?.props || {}), ...placeholder, clearable }" v-model="searchParam[handleProp(column.prop)]" :data="column.options" />
  </template>
  <template v-if="column?.el === 'cascader'">
    <el-cascader v-bind="{ ...(column?.props || {}), ...placeholder, clearable }" v-model="searchParam[handleProp(column.prop)]" :options="column.options" />
  </template>
  <template v-if="column?.el === 'date-picker'">
    <el-date-picker v-bind="{ ...(column?.props || {}), ...placeholder, clearable }" v-model="searchParam[handleProp(column.prop)]" />
  </template>
  <template v-if="column?.el === 'time-picker'">
    <el-time-picker v-bind="{ ...(column?.props || {}), ...placeholder, clearable }" v-model="searchParam[handleProp(column.prop)]" />
  </template>
  <template v-if="column?.el === 'time-select'">
    <el-time-select v-bind="{ ...(column?.props || {}), ...placeholder, clearable }" v-model="searchParam[handleProp(column.prop)]" />
  </template>
  <template v-if="column?.el === 'switch'">
    <el-switch v-bind="{ ...(column?.props || {}), ...placeholder, clearable }" v-model="searchParam[handleProp(column.prop)]" />
  </template>
  <template v-if="column?.el === 'slider'">
    <el-slider v-bind="{ ...(column?.props || {}), ...placeholder, clearable }" v-model="searchParam[handleProp(column.prop)]" />
  </template>
</template>

<script setup lang="ts">
import { handleProp } from "@/utils";
import { SearchProps } from "../type";

defineOptions({
  name: "SearchFormItem"
});

interface Props {
  column: SearchProps;
  searchParam: { [key: string]: any };
}
const props = defineProps<Props>();

// 处理默认 placeholder
const placeholder = computed(() => {
  const search = props.column;
  if (["datetimerange", "daterange", "monthrange"].includes(search?.props?.type) || search?.props?.isRange) {
    return {
      rangeSeparator: "至",
      startPlaceholder: "开始时间",
      endPlaceholder: "结束时间"
    };
  }
  const placeholder = search?.props?.placeholder ?? (search?.el?.includes("input") ? "请输入" : "请选择");
  return { placeholder };
});

// 是否有清除按钮 (当搜索项有默认值时，清除按钮不显示)
const clearable = computed(() => {
  const search = props.column;
  return search?.props?.clearable ?? (search?.defaultValue == null || search?.defaultValue == undefined);
});
</script>

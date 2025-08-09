<template>
  <!-- 输入框 -->
  <template v-if="column.type === 'input'">
    <el-input v-bind="{ ...(column.props || {}), ...placeholder }" v-model="modelValue[column.prop]" />
  </template>
  <!-- 数字输入框 -->
  <template v-if="column.type === 'input-number'">
    <el-input-number v-bind="{ ...(column.props || {}), ...placeholder }" v-model="modelValue[column.prop]" />
  </template>
  <!-- 下拉选择器 -->
  <template v-if="column.type === 'select'">
    <el-select v-bind="{ ...(column.props || {}), ...placeholder }" v-model="modelValue[column.prop]" />
  </template>
  <!-- 虚拟列表选择器 -->
  <template v-if="column.type === 'select-v2'">
    <el-select-v2 v-bind="{ ...(column.props || {}), ...placeholder }" v-model="modelValue[column.prop]" :options="column.props?.options" />
  </template>
  <!-- 树选择器 -->
  <template v-if="column.type === 'tree-select'">
    <el-tree-select v-bind="{ ...(column.props || {}), ...placeholder }" v-model="modelValue[column.prop]" />
  </template>
  <!-- 级联选择器 -->
  <template v-if="column.type === 'cascader'">
    <el-cascader v-bind="{ ...(column.props || {}), ...placeholder }" v-model="modelValue[column.prop]" />
  </template>
  <!-- 日期选择器 -->
  <template v-if="column.type === 'date-picker'">
    <el-date-picker v-bind="{ ...(column.props || {}), ...placeholder }" v-model="modelValue[column.prop]" />
  </template>
  <!-- 时间选择器 -->
  <template v-if="column.type === 'time-picker'">
    <el-time-picker v-bind="{ ...(column.props || {}), ...placeholder }" v-model="modelValue[column.prop]" />
  </template>
  <!-- 时间选择 -->
  <template v-if="column.type === 'time-select'">
    <el-time-select v-bind="{ ...(column.props || {}), ...placeholder }" v-model="modelValue[column.prop]" />
  </template>
  <!-- 开关切换 -->
  <template v-if="column.type === 'switch'">
    <el-switch v-bind="{ ...(column.props || {}) }" v-model="modelValue[column.prop]" />
  </template>
  <!-- 滑块 -->
  <template v-if="column.type === 'slider'">
    <el-slider v-bind="{ ...(column.props || {}) }" v-model="modelValue[column.prop]" />
  </template>
  <!-- 颜色选择器 -->
  <template v-if="column.type === 'color-picker'">
    <el-color-picker v-model="modelValue[column.prop]" v-bind="{ ...(column.props || {}) }" />
  </template>
  <!-- 多选 -->
  <template v-else-if="column.type === 'checkbox'">
    <el-checkbox-group v-model="modelValue[column.prop]" v-bind="{ ...(column.props || {}) }">
      <el-checkbox v-for="{ label, value } in column.props?.options" :key="value" :label="value">{{ label }}</el-checkbox>
    </el-checkbox-group>
  </template>
  <!-- 单选 -->
  <template v-else-if="column.type === 'radio'">
    <el-radio-group v-model="modelValue[column.prop]" v-bind="{ ...(column.props || {}) }">
      <el-radio v-for="{ label, value } in column.props?.options" :key="value" :label="value">{{ label }}</el-radio>
    </el-radio-group>
  </template>
  <!-- 图片上传 -->
  <template v-if="column.type === 'upload'">
    <UploadImg v-model="modelValue[column.prop]" v-bind="{ ...(column.props || {}) }" />
  </template>
  <template v-if="column.type === 'uploads'">
    <UploadImgs v-model="modelValue[column.prop]" v-bind="{ ...(column.props || {}) }" />
  </template>
  <!-- 富文本 -->
  <template v-if="column.type === 'richtext'">
    <WangEditor v-model="modelValue[column.prop]" v-bind="{ ...(column.props || {}) }" />
  </template>
</template>

<script setup lang="ts">
import { FormItemProps } from "../type";

defineOptions({
  name: "FormItem"
});

const props = defineProps<{
  column: FormItemProps;
}>();

const modelValue = defineModel<{ [key: string]: any }>({ required: true }); // 表单参数

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
  return { placeholder: search?.props?.placeholder ?? (search?.type?.includes("input") ? "请输入" : "请选择") };
});
</script>

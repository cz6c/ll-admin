<script setup lang="ts" name="FormView">
import { FormItem } from "./index.d";
import { BreakPoint } from "@/components/Grid/type";
import { handleProp } from "@/utils";
import { isFunction } from "@/utils/is";
import { cloneDeep } from "lodash-es";
import type { FormInstance, FormRules } from "element-plus";
const formRef = ref<FormInstance>();

export interface FormViewProps {
  columns: FormItem[]; // 表单配置列
  formItemCol?: Record<BreakPoint, number>; // 表单布局
  labelWidth?: string | number;
  labelPosition?: "left" | "right" | "top";
}
const props = withDefaults(defineProps<FormViewProps>(), {
  columns: () => [],
  formItemCol: () => ({
    xl: 8, // >=1920px
    lg: 8, // >=1200px
    md: 12, // >=992px
    sm: 24, // >=768px
    xs: 24, // <768px
  }),
  labelWidth: 120,
  labelPosition: "right",
});

const modelValue = defineModel<{ [key: string]: any }>({ required: true }); // 表单参数

const initilaData = cloneDeep(modelValue.value);

/**
 * @description: 处理表单验证
 */
const rules = computed(() => {
  const temp: FormRules = {};
  props.columns.forEach(({ type = "input", label, required, rules = [], prop }) => {
    const blurArr = ["input"];
    const trigger = blurArr.includes(type) ? "blur" : "change";
    const message = blurArr.includes(type) ? `请输入${label}` : `请选择${label}`;
    const arr = required ? [{ required: true, message, trigger }] : [];
    const ruleList = [...arr, ...rules];
    temp[prop] = ruleList;
  });
  return temp;
});
// 处理默认 placeholder
const getPlaceholder = (item: FormItem) => {
  if (["datetimerange", "daterange", "monthrange"].includes(item?.props?.type) || item?.props?.isRange) {
    return { rangeSeparator: "至", startPlaceholder: "开始时间", endPlaceholder: "结束时间" };
  }
  const placeholder = item?.props?.placeholder ?? `${item.type.includes("input") ? "请输入" : "请选择"}${item.label}`;
  return { placeholder };
};

/**
 * @description: 提交表单
 */
const submitForm = async (validCallback: Fn) => {
  if (!formRef.value) return;
  formRef.value.validate(valid => {
    if (valid) {
      console.log("submit!");
      isFunction(validCallback) && validCallback();
    } else {
      console.log("error submit!");
    }
  });
};

/**
 * @description: 初始化表单数据
 */
const initData = () => {
  Object.keys(modelValue.value).forEach(key => {
    modelValue.value[key] = initilaData[key];
  });
  if (!formRef.value) return;
  formRef.value.resetFields();
};

defineExpose({
  submitForm,
  initData,
});
</script>

<template>
  <el-form
    ref="formRef"
    class="form-view"
    :model="modelValue"
    :rules="rules"
    status-icon
    label-suffix="："
    v-bind="$attrs"
  >
    <el-row>
      <el-col
        v-for="item in props.columns"
        :key="item.prop"
        v-bind="item.span ? { span: item.span } : formItemCol"
        :style="item.itemStyle"
      >
        <template v-if="!item.hidden">
          <el-form-item
            :prop="item.prop"
            :label="item.label"
            :labelWidth="item.itemLabelWidth || props.labelWidth"
            :required="item.required"
          >
            <!-- 颜色选择器 -->
            <template v-if="item.type === 'color-picker'">
              <el-color-picker
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="{
                  ...(item?.props || {}),
                }"
              />
            </template>
            <!-- 树选择器 -->
            <template v-else-if="item.type === 'tree-select'">
              <el-tree-select
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="{
                  ...(item?.props || {}),
                  ...getPlaceholder(item),
                }"
              />
            </template>
            <!-- 级联选择器 -->
            <template v-else-if="item.type === 'cascader'">
              <el-cascader
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="{
                  ...(item?.props || {}),
                  ...getPlaceholder(item),
                }"
              />
            </template>
            <!-- 日期时间选择器 -->
            <template v-else-if="item.type === 'date-picker'">
              <el-date-picker
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="{
                  ...(item?.props || {}),
                  ...getPlaceholder(item),
                }"
              />
            </template>
            <!-- 时间选择器 -->
            <template v-else-if="item.type === 'time-picker'">
              <el-time-picker
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="{
                  ...(item?.props || {}),
                  ...getPlaceholder(item),
                }"
              />
            </template>
            <!-- 时间选择 -->
            <template v-else-if="item.type === 'time-select'">
              <el-time-select
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="{
                  ...(item?.props || {}),
                  ...getPlaceholder(item),
                }"
              />
            </template>
            <!-- 滑块 -->
            <template v-else-if="item.type === 'slider'">
              <el-slider
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="{
                  ...(item?.props || {}),
                }"
              />
            </template>
            <!-- 日期选择器 -->
            <template v-else-if="item.type === 'date'">
              <el-date-picker
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="{
                  ...(item?.props || {}),
                  ...getPlaceholder(item),
                }"
                :disabled="item.disabled"
              />
            </template>
            <!-- 下拉选择器 -->
            <template v-else-if="item.type === 'select'">
              <el-select
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="{
                  ...(item?.props || {}),
                  ...getPlaceholder(item),
                }"
                :disabled="item.disabled"
              >
                <el-option v-for="{ label, value } in item.props.options" :key="value" :label="label" :value="value" />
              </el-select>
            </template>
            <!-- 虚拟列表选择器 -->
            <template v-else-if="item.type === 'select-v2'">
              <el-select-v2
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="{
                  ...(item?.props || {}),
                  ...getPlaceholder(item),
                }"
                :disabled="item.disabled"
              />
            </template>
            <!-- 开关切换 -->
            <template v-else-if="item.type === 'switch'">
              <el-switch
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="item?.props || {}"
                :disabled="item.disabled"
              />
            </template>
            <!-- 多选 -->
            <template v-else-if="item.type === 'checkbox'">
              <el-checkbox-group
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="item?.props || {}"
                :disabled="item.disabled"
              >
                <el-checkbox v-for="{ label, value } in item.props.options" :key="value" :label="value">{{
                  label
                }}</el-checkbox>
              </el-checkbox-group>
            </template>
            <!-- 单选 -->
            <template v-else-if="item.type === 'radio'">
              <el-radio-group
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="item?.props || {}"
                :disabled="item.disabled"
              >
                <el-radio v-for="{ label, value } in item.props.options" :key="value" :label="value">{{
                  label
                }}</el-radio>
              </el-radio-group>
            </template>
            <!-- 图片上传 -->
            <template v-else-if="item.type === 'upload'">
              <UploadImg
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="item?.props || {}"
                :disabled="item.disabled"
              />
            </template>
            <template v-else-if="item.type === 'uploads'">
              <UploadImgs
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="item?.props || {}"
                :disabled="item.disabled"
              />
            </template>
            <!-- 数字输入框 -->
            <template v-else-if="item.type === 'input-number'">
              <el-input-number
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="{
                  ...(item?.props || {}),
                  ...getPlaceholder(item),
                }"
                :disabled="item.disabled"
              />
            </template>
            <!-- 输入框 -->
            <template v-else>
              <el-input
                v-model="modelValue[handleProp(item.prop)]"
                v-bind="{
                  ...(item?.props || {}),
                  ...getPlaceholder(item),
                }"
                :disabled="item.disabled"
              />
            </template>
          </el-form-item>
        </template>
      </el-col>
    </el-row>
  </el-form>
</template>

<style scoped lang="scss"></style>

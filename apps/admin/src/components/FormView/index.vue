<script setup lang="ts">
import { BreakPoint } from "@/components/Grid/type";
import FormItem from "./components/FormItem.vue";
import type { BaseFormItem } from "@/components/FormView/type";
import { isFunction } from "@llcz/common";
import { cloneDeep } from "lodash-es";
import type { FormInstance, FormRules } from "element-plus";
const formRef = ref<FormInstance>();

defineOptions({
  name: "FormView"
});

export interface FormViewProps {
  columns: BaseFormItem[]; // 表单配置列
  formItemCol?: Record<BreakPoint, number>; // 表单布局
  labelWidth?: string | number;
  labelPosition?: "left" | "right" | "top";
}
const props = withDefaults(defineProps<FormViewProps>(), {
  formItemCol: () => ({
    xl: 8, // >=1920px
    lg: 8, // >=1200px
    md: 12, // >=992px
    sm: 24, // >=768px
    xs: 24 // <768px
  }),
  labelWidth: 120,
  labelPosition: "right"
});

const formData = defineModel<{ [key: string]: any }>({ required: true }); // 表单参数

const initilaData = cloneDeep(formData.value);

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
  Object.keys(formData.value).forEach(key => {
    formData.value[key] = initilaData[key];
  });
  if (!formRef.value) return;
  formRef.value.resetFields();
};

defineExpose({
  submitForm,
  initData
});
</script>

<template>
  <el-form ref="formRef" class="form-view" :model="formData" :rules="rules" status-icon label-suffix="：" v-bind="$attrs">
    <el-row>
      <el-col v-for="item in props.columns" :key="item.prop" v-bind="item.span ? { span: item.span } : formItemCol" :style="item.itemStyle">
        <template v-if="!item.hidden">
          <el-form-item :prop="item.prop" :label="item.label" :labelWidth="item.itemLabelWidth || props.labelWidth" :required="item.required">
            <FormItem v-model="formData" :column="item" />
          </el-form-item>
        </template>
      </el-col>
    </el-row>
  </el-form>
</template>

<style scoped lang="scss"></style>

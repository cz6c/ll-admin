<script setup lang="ts">
import { BreakPoint } from "@/components/Grid/type";
import FormItem from "./components/FormItem.vue";
import type { BaseFormItem } from "@/components/FormView/type";
import { isFunction } from "@llcz/common";
import { cloneDeep } from "lodash-es";
import type { FormInstance, Rule } from "ant-design-vue/es/form";

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
    xl: 8, // ≥1920px
    lg: 8, // ≥1200px
    md: 12, // ≥992px
    sm: 24, // ≥768px
    xs: 24 // <768px
  }),
  labelWidth: 120,
  labelPosition: "right"
});

const formData = defineModel<{ [key: string]: any }>({ required: true }); // 表单参数

const initilaData = cloneDeep(formData.value);

/** label 固定宽度 → ant Form labelCol.style */
function toLabelCol(width: string | number | undefined) {
  if (width == null || width === "") return undefined;
  const w = typeof width === "number" ? `${width}px` : String(width);
  return { style: { width: w } };
}

const formLayout = computed(() => (props.labelPosition === "top" ? "vertical" : "horizontal"));
const formLabelAlign = computed(() => (props.labelPosition === "top" ? "left" : props.labelPosition));
const formLabelCol = computed(() => (props.labelPosition === "top" ? undefined : toLabelCol(props.labelWidth)));

/**
 * @description: 处理表单验证
 */
const rules = computed(() => {
  const temp: Record<string, Rule[]> = {};
  props.columns.forEach(({ type = "input", label, required, rules = [], prop }) => {
    const blurArr = ["input"];
    const trigger = blurArr.includes(type) ? "blur" : "change";
    const message = blurArr.includes(type) ? `请输入${label}` : `请选择${label}`;
    const arr: Rule[] = required ? [{ required: true, message, trigger }] : [];
    const ruleList: Rule[] = [...arr, ...(rules as Rule[])];
    temp[prop] = ruleList;
  });
  return temp;
});

/**
 * @description: 提交表单（antd validate 为 Promise：成功 resolve，失败 reject）
 */
const submitForm = async (validCallback: Fn) => {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
    console.log("submit!");
    isFunction(validCallback) && validCallback();
  } catch {
    console.log("error submit!");
  }
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
  <a-form
    ref="formRef"
    class="form-view"
    :model="formData"
    :rules="rules"
    :layout="formLayout"
    :label-align="formLabelAlign"
    :label-col="formLabelCol"
    colon
    v-bind="$attrs"
  >
    <a-row>
      <a-col v-for="item in props.columns" :key="item.prop" v-bind="item.span ? { span: item.span } : formItemCol" :style="item.itemStyle">
        <template v-if="!item.hidden">
          <a-form-item
            :name="item.prop"
            :label="item.label"
            :required="item.required"
            :label-col="item.itemLabelWidth ? toLabelCol(item.itemLabelWidth) : undefined"
          >
            <FormItem v-model="formData" :column="item" />
          </a-form-item>
        </template>
      </a-col>
    </a-row>
  </a-form>
</template>

<style scoped lang="scss"></style>

<template>
  <!-- 输入框 -->
  <template v-if="column.type === 'input'">
    <a-input v-bind="fieldBind" v-model:value="modelValue[column.prop]" />
  </template>
  <!-- 数字输入框 -->
  <template v-else-if="column.type === 'input-number'">
    <a-input-number v-bind="fieldBind" v-model:value="modelValue[column.prop]" style="width: 100%" />
  </template>
  <!-- 下拉选择器 -->
  <template v-else-if="column.type === 'select'">
    <a-select v-bind="fieldBind" v-model:value="modelValue[column.prop]" :options="column.props?.options" allow-clear />
  </template>
  <!-- 虚拟列表选择器（antd Select 默认 virtual） -->
  <template v-else-if="column.type === 'select-v2'">
    <a-select
      v-bind="fieldBind"
      v-model:value="modelValue[column.prop]"
      :options="column.props?.options"
      show-search
      allow-clear
      :virtual="column.props?.virtual !== false"
    />
  </template>
  <!-- 树选择器 -->
  <template v-else-if="column.type === 'tree-select'">
    <a-tree-select
      v-bind="fieldBind"
      v-model:value="modelValue[column.prop]"
      :tree-data="column.props?.treeData"
      allow-clear
      tree-default-expand-all
    />
  </template>
  <!-- 级联选择器 -->
  <template v-else-if="column.type === 'cascader'">
    <a-cascader v-bind="fieldBind" v-model:value="modelValue[column.prop]" :options="column.props?.options" allow-clear />
  </template>
  <!-- 日期 / 日期区间 -->
  <template v-else-if="column.type === 'date-picker'">
    <a-date-picker v-bind="dateBind" v-model:value="modelValue[column.prop]" style="width: 100%" />
  </template>
  <template v-else-if="column.type === 'date-range'">
    <a-range-picker v-bind="dateBind" v-model:value="modelValue[column.prop]" style="width: 100%" />
  </template>
  <!-- 时间选择器 -->
  <template v-else-if="column.type === 'time-picker'">
    <a-time-picker v-bind="fieldBind" v-model:value="modelValue[column.prop]" style="width: 100%" />
  </template>
  <!-- 时间点：props.options 或由 start/end/step 生成 -->
  <template v-else-if="column.type === 'time-select'">
    <a-select v-bind="fieldBind" v-model:value="modelValue[column.prop]" :options="timeSelectOptions" allow-clear />
  </template>
  <!-- 开关 -->
  <template v-else-if="column.type === 'switch'">
    <a-switch v-bind="switchBind" v-model:checked="modelValue[column.prop]" />
  </template>
  <!-- 滑块 -->
  <template v-else-if="column.type === 'slider'">
    <a-slider v-bind="fieldBind" v-model:value="modelValue[column.prop]" />
  </template>
  <!-- 颜色：antdv4 无免费 ColorPicker，用原生 color input -->
  <template v-else-if="column.type === 'color-picker'">
    <a-input v-model:value="modelValue[column.prop]" type="color" style="width: 52px; padding: 2px" v-bind="omitOptionsBind" />
  </template>
  <!-- 多选 -->
  <template v-else-if="column.type === 'checkbox'">
    <a-checkbox-group v-model:value="modelValue[column.prop]" v-bind="omitOptionsBind">
      <a-checkbox v-for="{ label, value } in column.props?.options" :key="String(value)" :value="value">{{ label }}</a-checkbox>
    </a-checkbox-group>
  </template>
  <!-- 单选 -->
  <template v-else-if="column.type === 'radio'">
    <a-radio-group v-model:value="modelValue[column.prop]" v-bind="omitOptionsBind">
      <a-radio v-for="{ label, value } in column.props?.options" :key="String(value)" :value="value">{{ label }}</a-radio>
    </a-radio-group>
  </template>
  <!-- 图片上传 -->
  <template v-else-if="column.type === 'upload'">
    <UploadImg v-model="modelValue[column.prop]" v-bind="{ ...(column.props || {}) }" />
  </template>
  <template v-else-if="column.type === 'uploads'">
    <UploadImgs v-model="modelValue[column.prop]" v-bind="{ ...(column.props || {}) }" />
  </template>
  <!-- 富文本 -->
  <template v-else-if="column.type === 'richtext'">
    <WangEditor v-model="modelValue[column.prop]" v-bind="{ ...(column.props || {}) }" />
  </template>
</template>

<script setup lang="ts">
/**
 * FormView 字段渲染器
 * 职责：按 column.type 映射到 ant-design-vue 控件；props 按 ant API 透传
 * 适用：FormView / SearchForm
 */
import { FormItemProps } from "../type";
import UploadImg from "@/components/Upload/UploadImg.vue";
import UploadImgs from "@/components/Upload/UploadImgs.vue";
import WangEditor from "@/components/WangEditor/index.vue";

defineOptions({
  name: "FormItem"
});

const props = defineProps<{
  column: FormItemProps;
}>();

const modelValue = defineModel<{ [key: string]: any }>({ required: true });

/** 透传时去掉已单独绑定的字段，避免与 ant API 冲突 */
function omitKeys(source: Record<string, any> | undefined, keys: string[]) {
  if (!source) return {};
  const next = { ...source };
  keys.forEach(k => {
    delete next[k];
  });
  return next;
}

const defaultPlaceholder = computed(() => {
  const t = props.column.type;
  if (t?.includes("input")) return "请输入";
  return "请选择";
});

const fieldBind = computed(() => ({
  ...omitKeys(props.column.props, ["options", "treeData", "virtual", "start", "end", "step", "separator"]),
  placeholder: props.column.props?.placeholder ?? defaultPlaceholder.value
}));

const omitOptionsBind = computed(() => omitKeys(props.column.props, ["options"]));

/** 日期控件：透传 ant DatePicker / RangePicker props（valueFormat、showTime、picker、placeholder…） */
const dateBind = computed(() => {
  const raw = props.column.props || {};
  const bind: Record<string, any> = { ...omitKeys(raw, ["separator"]) };
  if (props.column.type === "date-range") {
    bind.placeholder = raw.placeholder ?? ["开始时间", "结束时间"];
    if (raw.separator != null) bind.separator = raw.separator;
  } else if (bind.placeholder == null) {
    bind.placeholder = defaultPlaceholder.value;
  }
  return bind;
});

const switchBind = computed(() => omitKeys(props.column.props, []));

/** time-select：优先用 props.options；否则按 start/end/step（HH:mm）生成 */
const timeSelectOptions = computed(() => {
  if (props.column.props?.options?.length) return props.column.props.options;
  const start = String(props.column.props?.start ?? "00:00");
  const end = String(props.column.props?.end ?? "23:45");
  const step = String(props.column.props?.step ?? "00:15");
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  const startM = toMinutes(start);
  const endM = toMinutes(end);
  const stepM = Math.max(toMinutes(step) || 15, 1);
  const options: { label: string; value: string }[] = [];
  for (let m = startM; m <= endM; m += stepM) {
    const label = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    options.push({ label, value: label });
  }
  return options;
});
</script>

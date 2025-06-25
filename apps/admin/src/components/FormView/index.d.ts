import type { FormItemRule } from "element-plus";
import type { FormViewProps } from "./index.vue";
import type FormView from "./index.vue";
import type { CSSProperties } from "vue";

export type FormItemType =
  | "color-picker"
  | "tree-select"
  | "cascader"
  | "date-picker"
  | "time-picker"
  | "time-select"
  | "slider"
  | "date"
  | "select"
  | "select-v2"
  | "switch"
  | "checkbox"
  | "radio"
  | "upload"
  | "uploads"
  | "input-number"
  | "input";

// 表单配置项
export interface FormItem {
  type: FormItemType;
  prop: string;
  label: string;
  itemLabelWidth?: string | number;
  required?: boolean;
  rules?: Array<FormItemRule>;
  span?: number;
  offset?: number;
  itemStyle?: CSSProperties;
  disabled?: boolean;
  hidden?: boolean;
  props?: any; // 表单项参数，该属性所有值会透传到组件内
}

export type FormViewInstance = Omit<InstanceType<typeof FormView>, keyof ComponentPublicInstance | keyof FormViewProps>;

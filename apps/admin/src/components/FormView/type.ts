import type { FormItemRule } from "element-plus";
import type { CSSProperties } from "vue";
import type { FormViewProps } from "./index.vue";
import type { SearchFormProps } from "./SearchForm.vue";
import type FormView from "./index.vue";
import type SearchForm from "./index.vue";

// 选项类型
export interface OptionsType {
  label?: string; // 选项框显示的文字
  value?: string | number; // 选项框值
  disabled?: boolean; // 是否禁用此选项
  children?: OptionsType[]; // 为树形选择时，可以通过 children 属性指定子选项
  leaf?: boolean; // 为树形选择时，是否有子节点
  [key: string]: any;
}

// 表单项组件参数类型
export interface PropsType {
  options?: OptionsType[];
  [key: string]: any;
}

// 表单项类型
export type FormItemType =
  | "input"
  | "input-number"
  | "select"
  | "select-v2"
  | "tree-select"
  | "cascader"
  | "date-picker"
  | "time-picker"
  | "time-select"
  | "switch"
  | "slider"
  | "color-picker"
  | "checkbox"
  | "radio"
  | "upload"
  | "uploads"
  | "richtext";

// 表单配置项
export interface FormItemProps {
  type: FormItemType; // 当前项搜索框的类型
  prop: string; // model 的键名
  label: string; // 标签文本
  props?: PropsType; // 额外参数，该属性所有值会透传到组件内，elm组件可参考 element plus 官方对应组件文档
  itemLabelWidth?: string | number;
}

export interface BaseFormItem extends FormItemProps {
  required?: boolean;
  rules?: Array<FormItemRule>;
  span?: number;
  offset?: number;
  itemStyle?: CSSProperties;
  disabled?: boolean;
  hidden?: boolean;
}

export interface SearchFormItem extends FormItemProps {
  span?: number; // 搜索项所占用的列数，默认为1列
  offset?: number; // 搜索字段左侧偏移列数
}

export type FormViewInstance = Omit<InstanceType<typeof FormView>, keyof ComponentPublicInstance | keyof FormViewProps>;
export type SearchFormInstance = Omit<InstanceType<typeof SearchForm>, keyof ComponentPublicInstance | keyof SearchFormProps>;

export interface OptionsProps {
  label?: string; // 选项框显示的文字
  value?: string | number | boolean | any[]; // 选项框值
  disabled?: boolean; // 是否禁用此选项
  children?: OptionsProps[]; // 为树形选择时，可以通过 children 属性指定子选项
  [key: string]: any;
}

export type SearchType =
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
  | "slider";

export type SearchProps = {
  el: SearchType; // 当前项搜索框的类型
  label: string; // 标签文本
  prop: string; // model 的键名
  options?: OptionsProps; //下拉项数据;
  props?: any; // 搜索项参数，根据 element plus 官方文档来传递，该属性所有值会透传到组件
  order?: number; // 搜索项排序（从大到小）
  span?: number; // 搜索项所占用的列数，默认为1列
  offset?: number; // 搜索字段左侧偏移列数
};

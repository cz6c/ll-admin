import type { IconProps } from "@iconify/vue";

export interface OptionsType {
  /** 文字 */
  label: string | (() => string);
  /** 值 */
  value: any;
  /** 是否禁用 */
  disabled?: boolean;
  /** `tooltip` 提示 */
  tip?: string;
  /**
   * @description 图标，采用平台内置的 `useRenderIcon` 函数渲染
   */
  icon?: string;
  /** 图标属性、样式配置 */
  iconAttrs?: IconProps;
}

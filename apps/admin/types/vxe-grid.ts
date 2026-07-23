/**
 * vxe-grid 模板绑定类型（typecheck 临时放宽）
 * 职责：集中记录 vxe-pc-ui / vxe-table 与 vue-tsc 的 props 类型不匹配
 * 适用：列表页 v-bind="gridOptions" 直至依赖升级对齐
 */

/** Temporary loose bind for vxe-grid options; vxe-pc-ui props typing mismatches vue-tsc until upgrade */
export type VxeGridBindOptions = any

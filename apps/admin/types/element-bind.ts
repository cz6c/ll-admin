/**
 * Element Plus 组件模板绑定类型（typecheck 临时放宽）
 * 职责：runtime string prop 与 EP 窄 union 不一致时的集中 cast
 * 适用：BaseImage el-image fit 等，直至 props 改为 PropType 窄化
 */

/** Temporary loose bind for el-image fit; runtime default is string but EP expects ImageFit union until prop typing aligns */
export type ElImageFitBind = any

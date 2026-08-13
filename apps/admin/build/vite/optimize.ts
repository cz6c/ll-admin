/**
 * Vite `optimizeDeps.include` 预构建清单
 *
 * ant-design-vue 4 以 CSS-in-JS 为主，预收录主包即可，避免运行期发现依赖触发整页 reload。
 */
export const optimizeDepsInclude = [
  "ant-design-vue",
  "ant-design-vue/es",
  "dayjs",
  "dayjs/locale/zh-cn",
  "@wangeditor/editor-for-vue",
  "vue-tippy",
  "vue-cropper",
  "vxe-table",
  "vxe-pc-ui"
];

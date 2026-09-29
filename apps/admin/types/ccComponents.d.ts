/**
 * Cc 业务组件全局注册类型（与 registerCcComponents.ts 同步）
 * unplugin 仅负责 antd / VueUse；Cc 组件类型在此维护
 */
/* eslint-disable */
// @ts-nocheck
export {};

declare module "vue" {
  export interface GlobalComponents {
    CcDialog: typeof import("../src/components/Dialog/index.vue")["default"];
    CcDictTag: typeof import("../src/components/DictTag/index.vue")["default"];
    CcFormItem: typeof import("../src/components/FormView/components/FormItem.vue")["default"];
    CcFormView: typeof import("../src/components/FormView/index.vue")["default"];
    CcSearchForm: typeof import("../src/components/FormView/SearchForm.vue")["default"];
    CcGrid: typeof import("../src/components/Grid/index.vue")["default"];
    CcGridItem: typeof import("../src/components/Grid/components/GridItem.vue")["default"];
    CcIconifyIcon: typeof import("../src/components/IconifyIcon/index.vue")["default"];
    CcIconSelect: typeof import("../src/components/IconSelect/index.vue")["default"];
    CcImage: typeof import("../src/components/Image/index.vue")["default"];
    CcImportTemp: typeof import("../src/components/ImportTemp/index.vue")["default"];
    CcSettingsModal: typeof import("../src/components/SettingsModal/index.vue")["default"];
    CcToolButton: typeof import("../src/components/ToolButtons/ToolButton.vue")["default"];
    CcToolButtons: typeof import("../src/components/ToolButtons/index.vue")["default"];
    CcToolsBar: typeof import("../src/components/ToolsBar/index.vue")["default"];
    CcUploadImg: typeof import("../src/components/Upload/UploadImg.vue")["default"];
    CcUploadImgs: typeof import("../src/components/Upload/UploadImgs.vue")["default"];
    CcWangEditor: typeof import("../src/components/WangEditor/index.vue")["default"];
  }
}

/**
 * Cc 业务组件全局注册
 * 职责：在 main.ts 启动时注册 `src/components` 下全部 Cc 前缀组件，避免 unplugin auto-import 偶发未注入
 * 适用：registerGlobComp；模板中统一使用 `<CcXxx>`，禁止再手写 .vue import
 */
import type { App, Component } from "vue";
import Dialog from "./Dialog/index.vue";
import DictTag from "./DictTag/index.vue";
import FormItem from "./FormView/components/FormItem.vue";
import FormView from "./FormView/index.vue";
import SearchForm from "./FormView/SearchForm.vue";
import GridItem from "./Grid/components/GridItem.vue";
import Grid from "./Grid/index.vue";
import IconifyIcon from "./IconifyIcon/index.vue";
import IconSelect from "./IconSelect/index.vue";
import Image from "./Image/index.vue";
import ImportTemp from "./ImportTemp/index.vue";
import SettingsModal from "./SettingsModal/index.vue";
import ToolButton from "./ToolButtons/ToolButton.vue";
import ToolButtons from "./ToolButtons/index.vue";
import ToolsBar from "./ToolsBar/index.vue";
import UploadImg from "./Upload/UploadImg.vue";
import UploadImgs from "./Upload/UploadImgs.vue";
import WangEditor from "./WangEditor/index.vue";

/** 注册名 → 组件；命名与历史 unplugin `prefix: Cc` + 目录名一致 */
const ccComponents: Record<string, Component> = {
  CcDialog: Dialog,
  CcDictTag: DictTag,
  CcFormItem: FormItem,
  CcFormView: FormView,
  CcSearchForm: SearchForm,
  CcGrid: Grid,
  CcGridItem: GridItem,
  CcIconifyIcon: IconifyIcon,
  CcIconSelect: IconSelect,
  CcImage: Image,
  CcImportTemp: ImportTemp,
  CcSettingsModal: SettingsModal,
  CcToolButton: ToolButton,
  CcToolButtons: ToolButtons,
  CcToolsBar: ToolsBar,
  CcUploadImg: UploadImg,
  CcUploadImgs: UploadImgs,
  CcWangEditor: WangEditor
};

/**
 * 注册全部 Cc 业务组件到 Vue 应用
 * @param app createApp 实例
 */
export function registerCcComponents(app: App<Element>) {
  Object.entries(ccComponents).forEach(([name, component]) => {
    app.component(name, component);
  });
}

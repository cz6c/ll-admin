import {
  VxeUI,
  VxeButton,
  VxeButtonGroup,
  VxeCheckbox,
  VxeCheckboxGroup,
  VxeIcon,
  VxeIconPicker,
  VxeLoading,
  VxePager,
  VxeSelect,
  VxeTooltip
} from "vxe-pc-ui";
import { VxeTable, VxeColumn, VxeColgroup, VxeGrid, VxeToolbar } from "vxe-table";
export function lazyVxeTable(app) {
  app.use(VxeButton);
  app.use(VxeButtonGroup);
  app.use(VxeCheckbox);
  app.use(VxeCheckboxGroup);
  app.use(VxeIcon);
  app.use(VxeIconPicker);
  app.use(VxeLoading);
  app.use(VxePager);
  app.use(VxeSelect);
  app.use(VxeTooltip);

  app.use(VxeTable);
  app.use(VxeColumn);
  app.use(VxeColgroup);
  app.use(VxeGrid);
  app.use(VxeToolbar);
}

VxeUI.setIcon({
  // table
  TABLE_SORT_ASC: "vxe-table-icon-caret-up",
  TABLE_SORT_DESC: "vxe-table-icon-caret-down",
  TABLE_FILTER_NONE: "vxe-table-icon-funnel",
  TABLE_FILTER_MATCH: "vxe-table-icon-funnel",
  TABLE_EDIT: "vxe-table-icon-edit",
  TABLE_TITLE_PREFIX: "vxe-table-icon-question-circle-fill",
  TABLE_TITLE_SUFFIX: "vxe-table-icon-question-circle-fill",
  TABLE_TREE_LOADED: "vxe-table-icon-spinner roll",
  TABLE_TREE_OPEN: "vxe-table-icon-caret-right rotate90",
  TABLE_TREE_CLOSE: "vxe-table-icon-caret-right",
  TABLE_EXPAND_LOADED: "vxe-table-icon-spinner roll",
  TABLE_EXPAND_OPEN: "vxe-table-icon-arrow-right rotate90",
  TABLE_EXPAND_CLOSE: "vxe-table-icon-arrow-right",
  TABLE_CHECKBOX_CHECKED: "vxe-table-icon-checkbox-checked-fill",
  TABLE_CHECKBOX_UNCHECKED: "vxe-table-icon-checkbox-unchecked",
  TABLE_CHECKBOX_INDETERMINATE: "vxe-table-icon-checkbox-indeterminate-fill",
  TABLE_RADIO_CHECKED: "vxe-table-icon-radio-checked-fill",
  TABLE_RADIO_UNCHECKED: "vxe-table-icon-radio-unchecked",
  TABLE_CUSTOM_SORT: "vxe-table-icon-drag-handle",
  TABLE_MENU_OPTIONS: "vxe-table-icon-arrow-right",

  // toolbar
  TOOLBAR_TOOLS_REFRESH: "vxe-table-icon-repeat",
  TOOLBAR_TOOLS_REFRESH_LOADING: "vxe-table-icon-repeat roll",
  TOOLBAR_TOOLS_IMPORT: "vxe-table-icon-upload",
  TOOLBAR_TOOLS_EXPORT: "vxe-table-icon-download",
  TOOLBAR_TOOLS_PRINT: "vxe-table-icon-print",
  TOOLBAR_TOOLS_FULLSCREEN: "vxe-table-icon-fullscreen",
  TOOLBAR_TOOLS_MINIMIZE: "vxe-table-icon-minimize",
  TOOLBAR_TOOLS_CUSTOM: "vxe-table-icon-custom-column",
  TOOLBAR_TOOLS_FIXED_LEFT: "vxe-table-icon-fixed-left",
  TOOLBAR_TOOLS_FIXED_LEFT_ACTIVE: "vxe-table-icon-fixed-left-fill",
  TOOLBAR_TOOLS_FIXED_RIGHT: "vxe-table-icon-fixed-right",
  TOOLBAR_TOOLS_FIXED_RIGHT_ACTIVE: "vxe-table-icon-fixed-right-fill"
});

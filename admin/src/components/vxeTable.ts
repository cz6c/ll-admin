import { VxeTooltip } from "vxe-pc-ui";
import { VxeUI, VxeTable, VxeColumn, VxeGrid } from "vxe-table";
// https://vxetable.cn/#/table/api
VxeUI.setConfig({
  table: {
    showOverflow: "tooltip", // ellipsis（只显示省略号）, title（并且显示为原生 title）, tooltip（并且显示为 tooltip 提示）
    showHeader: true,
    minHeight: 144,
    stripe: false,
    border: false,
    round: true,
    autoResize: true,
    emptyText: "暂无数据",
    // emptyRender: {
    //   name: ''
    // },
    tooltipConfig: {
      enterable: true
    },
    rowConfig: {
      useKey: true,
      keyField: "id",
      isHover: true,
      height: 64
    },
    columnConfig: {
      useKey: true,
      resizable: true,
      minWidth: 80,
      maxFixedSize: 4
    },
    sortConfig: {
      remote: true
    },
    checkboxConfig: {
      strict: true
    },
    scrollX: {
      // enabled: false, // 是否默认开启虚拟滚动
      gt: 60
      // oSize: 0
    },
    scrollY: {
      enabled: true, // 是否默认开启虚拟滚动
      gt: 60
      // oSize: 0
    },
    printConfig: {},
    keyboardConfig: {
      isEsc: true
    },
    customConfig: {
      //  storage: false,
    }
  },
  grid: {
    zoomConfig: {
      escRestore: true
    },
    pagerConfig: {
      layouts: ["Total", "Sizes", "PrevPage", "JumpNumber", "NextPage", "FullJump"],
      pageSizes: [10, 20, 30, 50, 100],
      align: "center"
    }
  }
});
export function lazyVxeTable(app) {
  // app.use(VxeButton);
  // app.use(VxeButtonGroup);
  // app.use(VxeCheckbox);
  // app.use(VxeCheckboxGroup);
  // app.use(VxePager);
  // app.use(VxeSelect);
  app.use(VxeTooltip);

  app.use(VxeTable);
  app.use(VxeColumn);
  app.use(VxeGrid);
  // app.use(VxeToolbar);
}

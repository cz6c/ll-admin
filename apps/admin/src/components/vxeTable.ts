import { VxeTooltip } from "vxe-pc-ui";
import { VxeUI, VxeGrid } from "vxe-table";
// https://vxetable.cn/#/table/api
VxeUI.setConfig({
  table: {
    stripe: false,
    border: false,
    round: true,
    showOverflow: "tooltip", // ellipsis（只显示省略号）, title（并且显示为原生 title）, tooltip（并且显示为 tooltip 提示）
    showHeaderOverflow: "tooltip",
    showHeader: true,
    align: "center",
    headerAlign: "center",
    emptyText: "暂无数据",
    tooltipConfig: {
      enterable: true
    },
    rowConfig: {
      keyField: "_VXE_ID",
      isHover: true,
      isCurrent: true
    },
    columnConfig: {
      minWidth: 80
    },
    sortConfig: {
      remote: true
    },
    scrollY: {
      enabled: true, // 是否默认开启虚拟滚动
      gt: 60
    },
    printConfig: {}
  },
  grid: {
    toolbarConfig: {
      refresh: true,
      zoom: true,
      custom: true
    },
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
  app.use(VxeTooltip);
  app.use(VxeGrid);
}

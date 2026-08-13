<script setup lang="tsx">
import { listLogininfor } from "@/api/monitor/logininfor";
import { LoginlogListParams, MonitorLoginlogVO } from "#/api/monitor/logininfor";
import { dateUtil, formatToDatetime } from "@llcz/common";
import $file from "@/utils/file";
import { useDict } from "@/hooks/useDict";
import { VxeGridProps } from "vxe-table";
import type { VxeGridBindOptions } from "#/vxe-grid";
import { useTable } from "@/hooks/useVxetable";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import { SearchFormItem } from "@/components/FormView/type";

defineOptions({
  name: "Logininfor"
});

const route = useRoute();

const { SuccessErrorEnum } = toRefs(useDict("SuccessErrorEnum"));

const searchList = reactive<SearchFormItem[]>([
  {
    type: "input",
    prop: "ipaddr",
    label: "登录地址"
  },
  {
    type: "input",
    prop: "userName",
    label: "用户名称"
  },
  {
    type: "select",
    prop: "status",
    label: "登录状态",
    props: {
      options: SuccessErrorEnum.value
    }
  },
  {
    type: "date-range",
    prop: "dateRange",
    label: "登录时间",
    props: {
      valueFormat: "YYYY-MM-DD",
      placeholder: ["开始日期", "结束日期"],
      separator: "-"
    }
  }
]);
const apiQuery = reactive<LoginlogListParams>({
  dateRange: null,
  beginTime: null,
  endTime: null,
  orderByColumn: undefined,
  order: undefined,
  ipaddr: undefined,
  userName: undefined,
  status: undefined
});

const toolbarButtons: BtnOptionsProps[] = [
  {
    btnText: "导出",
    props: {},
    icon: "ant-design:download-outlined",
    authCode: "export",
    handleClick: () => {
      handleExport();
    }
  }
];

const gridOptions = reactive<VxeGridProps<MonitorLoginlogVO>>({
  height: "auto",
  loading: true,
  checkboxConfig: {
    reserve: true
  },
  pagerConfig: {
    total: 0,
    currentPage: 1,
    pageSize: 10
  },
  toolbarConfig: {
    refreshOptions: {
      queryMethod: () => {
        return initListSearch();
      }
    },
    slots: {
      buttons: "toolbar_buttons"
    }
  },
  id: route.path, // 用户个性化记忆功能，必须确保 id 是整个全局唯一的
  customConfig: {
    storage: true // 存储key VXE_CUSTOM_STORE
  },
  columns: [
    { field: "infoId", title: "访问编号" },
    { field: "userName", title: "用户名称" },
    { field: "ipaddr", title: "地址" },
    { field: "loginLocation", title: "登录地点" },
    { field: "os", title: "操作系统" },
    { field: "browser", title: "浏览器" },
    {
      field: "status",
      title: "登录状态",
      slots: {
        default({ row }) {
          return <dict-tag options={SuccessErrorEnum.value} value={row.status} />;
        }
      }
    },
    { field: "msg", title: "描述" },
    {
      field: "loginTime",
      title: "访问时间",
      width: 150,
      formatter: ({ row }) => {
        return formatToDatetime(row.loginTime);
      }
    }
  ],
  data: []
});

const { gridRef, gridEvents, initListSearch, resetListSearch } = useTable({
  gridOptions,
  getListApi: listLogininfor,
  apiQuery
});

initListSearch();

/** 重置按钮操作 */
function handleReset() {
  resetListSearch();
}

/** 导出按钮操作 */
function handleExport() {
  $file.download(
    "monitor/logininfor/export",
    {
      pageNum: gridOptions.pagerConfig.currentPage,
      pageSize: gridOptions.pagerConfig.pageSize,
      ...apiQuery
    },
    `logininfor_${dateUtil().format("YYYYMMDDHHmmss")}.xlsx`
  );
}
</script>

<template>
  <div class="app-page cz-card">
    <!--表格数据-->
    <vxe-grid ref="gridRef" v-bind="gridOptions as VxeGridBindOptions" v-on="gridEvents">
      <template #form>
        <SearchForm v-model="apiQuery" :columns="searchList" @search="initListSearch" @reset="handleReset" />
      </template>
      <template #toolbar_buttons>
        <ToolButtons :buttons="toolbarButtons" size="middle" />
      </template>
    </vxe-grid>
  </div>
</template>

<script setup lang="tsx">
import { listLogininfor } from "@/api/monitor/logininfor";
import { LoginlogListParams, MonitorLoginlogVO } from "#/api/monitor/logininfor";
import { parseTime } from "@/utils";
import $file from "@/utils/file";
import { useDict } from "@/hooks/useDict";
import { VxeGridProps } from "vxe-table";
import { useTable } from "@/hooks/useVxetable";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import { SearchProps } from "@/components/SearchForm/type";

defineOptions({
  name: "Logininfor"
});

const route = useRoute();

const { SuccessErrorEnum } = toRefs(useDict("SuccessErrorEnum"));

const searchList = reactive<SearchProps[]>([
  {
    el: "input",
    prop: "ipaddr",
    label: "登录地址"
  },
  {
    el: "input",
    prop: "userName",
    label: "用户名称"
  },
  {
    el: "select",
    prop: "status",
    label: "登录状态",
    options: SuccessErrorEnum
  },
  {
    el: "date-picker",
    prop: "dateRange",
    label: "登录时间",
    props: {
      type: "daterange",
      valueFormat: "YYYY-MM-DD",
      rangeSeparator: "-",
      startPlaceholder: "开始日期",
      endPlaceholder: "结束日期"
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
    props: {
      type: "warning",
      plain: true,
      icon: "Download"
    },
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
    refresh: {
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
        return parseTime(row.loginTime);
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
    `logininfor_${new Date().getTime()}.xlsx`
  );
}
</script>

<template>
  <div class="app-page cz-card pt-16">
    <!--表格数据-->
    <vxe-grid ref="gridRef" v-bind="gridOptions" v-on="gridEvents">
      <template #form>
        <SearchForm :columns="searchList" :search-param="apiQuery" @search="initListSearch" @reset="handleReset" />
      </template>
      <template #toolbar_buttons>
        <ToolButtons :buttons="toolbarButtons" size="default" />
      </template>
    </vxe-grid>
  </div>
</template>

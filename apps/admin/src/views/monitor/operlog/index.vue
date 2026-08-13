<script setup lang="tsx">
/**
 * 操作日志
 * 职责：按条件查询、导出与删除操作日志，弹窗查看详情
 * 适用：monitor/operlog；列表栈与 logininfor 对齐（VXE + SearchForm + ToolButtons）
 */
import { list, delOperlog } from "@/api/monitor/operlog";
import { dateUtil, formatToDatetime } from "@llcz/common";
import $file from "@/utils/file";
import $feedback from "@/utils/feedback";
import { useDict } from "@/hooks/useDict";
import { VxeGridProps } from "vxe-table";
import type { VxeGridBindOptions } from "#/vxe-grid";
import { useTable } from "@/hooks/useVxetable";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import { SearchFormItem } from "@/components/FormView/type";

defineOptions({
  name: "Operlog"
});

const route = useRoute();

const { SuccessErrorEnum } = toRefs(useDict("SuccessErrorEnum"));

const detailOpen = ref(false);
const detailRow = ref<Record<string, any>>({});

const searchList = reactive<SearchFormItem[]>([
  {
    type: "input",
    prop: "title",
    label: "系统模块"
  },
  {
    type: "input",
    prop: "operName",
    label: "操作人员"
  },
  {
    type: "select",
    prop: "status",
    label: "操作状态",
    props: {
      options: SuccessErrorEnum.value
    }
  },
  {
    type: "date-range",
    prop: "dateRange",
    label: "操作时间",
    props: {
      valueFormat: "YYYY-MM-DD",
      placeholder: ["开始日期", "结束日期"],
      separator: "-"
    }
  }
]);

const apiQuery = reactive({
  dateRange: null as string[] | null,
  beginTime: null as string | null,
  endTime: null as string | null,
  orderByColumn: undefined as string | undefined,
  order: undefined as string | undefined,
  title: undefined as string | undefined,
  operName: undefined as string | undefined,
  status: undefined as string | number | undefined
});

const toolbarButtons: BtnOptionsProps[] = [
  {
    btnText: "删除",
    props: {
      type: "primary",
      danger: true
    },
    icon: "ant-design:delete-outlined",
    authCode: "remove",
    handleClick: () => {
      handleDelete();
    },
    disabled: () => !selectRows.value.length,
    disabledTooltip: "请先勾选删除项"
  },
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

const gridOptions = reactive<VxeGridProps<any>>({
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
  id: route.path,
  customConfig: {
    storage: true
  },
  columns: [
    { type: "checkbox", width: 50 },
    { field: "operId", title: "日志编号" },
    { field: "title", title: "系统模块", showOverflow: true },
    { field: "operName", title: "操作人员", width: 110, showOverflow: true },
    { field: "operIp", title: "主机", width: 130, showOverflow: true },
    {
      field: "status",
      title: "操作状态",
      slots: {
        default({ row }) {
          return <dict-tag options={SuccessErrorEnum.value} value={row.status} />;
        }
      }
    },
    {
      field: "operTime",
      title: "操作日期",
      width: 180,
      formatter: ({ row }) => formatToDatetime(row.operTime)
    },
    {
      field: "costTime",
      title: "消耗时间",
      width: 110,
      formatter: ({ row }) => `${row.costTime ?? ""}毫秒`
    },
    {
      field: "tools",
      title: "操作",
      width: 100,
      fixed: "right",
      slots: {
        default: "tools_slot"
      }
    }
  ],
  data: []
});

const { gridRef, gridEvents, selectRows, initListSearch, resetListSearch } = useTable({
  gridOptions,
  getListApi: list,
  apiQuery
});

initListSearch();

function handleReset() {
  resetListSearch();
}

function handleView(row: Record<string, any>) {
  detailRow.value = row;
  detailOpen.value = true;
}

function handleDelete() {
  const ids = selectRows.value.map((r: any) => r.operId);
  if (!ids.length) return;
  $feedback
    .confirm('是否确认删除日志编号为"' + ids.join(",") + '"的数据项?')
    .then(() => delOperlog(ids.join(",")))
    .then(() => {
      initListSearch();
      $feedback.message.success("删除成功");
    })
    .catch(() => {});
}

function handleExport() {
  $file.download(
    "monitor/operlog/export",
    {
      pageNum: gridOptions.pagerConfig.currentPage,
      pageSize: gridOptions.pagerConfig.pageSize,
      ...apiQuery
    },
    `operlog_${dateUtil().format("YYYYMMDDHHmmss")}.xlsx`
  );
}

const rowButtons: BtnOptionsProps[] = [
  {
    btnText: "详细",
    props: {
      type: "link"
    },
    icon: "ant-design:eye-outlined",
    authCode: "query",
    handleClick: ({ row }) => {
      handleView(row);
    }
  }
];
</script>

<template>
  <div class="app-page cz-card">
    <vxe-grid ref="gridRef" v-bind="gridOptions as VxeGridBindOptions" v-on="gridEvents">
      <template #form>
        <SearchForm v-model="apiQuery" :columns="searchList" @search="initListSearch" @reset="handleReset" />
      </template>
      <template #toolbar_buttons>
        <ToolButtons :buttons="toolbarButtons" size="middle" />
      </template>
      <template #tools_slot="{ row }">
        <ToolButtons :buttons="rowButtons" :data="{ row }" />
      </template>
    </vxe-grid>

    <a-modal v-model:open="detailOpen" title="操作日志详细" width="700px" :footer="null" destroy-on-close>
      <a-form :model="detailRow" :label-col="{ style: { width: '100px' } }">
        <a-row>
          <a-col :span="12">
            <a-form-item label="操作模块：">{{ detailRow.title }}</a-form-item>
            <a-form-item label="登录信息："
              >{{ detailRow.operName }} / {{ detailRow.operIp }} / {{ detailRow.operLocation }}</a-form-item
            >
          </a-col>
          <a-col :span="12">
            <a-form-item label="请求地址：">{{ detailRow.operUrl }}</a-form-item>
            <a-form-item label="请求方式：">{{ detailRow.requestMethod }}</a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item label="操作方法：">{{ detailRow.method }}</a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item label="请求参数：">{{ detailRow.operParam }}</a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item label="返回参数：">{{ detailRow.jsonResult }}</a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="操作状态：">
              <span v-if="detailRow.status === 0 || detailRow.status === '0'">正常</span>
              <span v-else>失败</span>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="消耗时间：">{{ detailRow.costTime }}毫秒</a-form-item>
          </a-col>
          <a-col :span="10">
            <a-form-item label="操作时间：">{{ formatToDatetime(detailRow.operTime) }}</a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item v-if="detailRow.status === 1 || detailRow.status === '1'" label="异常信息：">{{
              detailRow.errorMsg
            }}</a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <div class="mt-16px text-right">
        <a-button @click="detailOpen = false">关 闭</a-button>
      </div>
    </a-modal>
  </div>
</template>

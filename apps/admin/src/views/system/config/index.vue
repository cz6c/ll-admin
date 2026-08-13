<script setup lang="tsx">
import { listConfig, delConfig } from "@/api/system/config";
import { ListConfigDto, SysConfigVo } from "#/api/system/config";
import { dateUtil, formatToDatetime } from "@llcz/common";
import $feedback from "@/utils/feedback";
import $file from "@/utils/file";
import { useDict } from "@/hooks/useDict";
import { VxeGridProps } from "vxe-table";
import type { VxeGridBindOptions } from "#/vxe-grid";
import { useTable } from "@/hooks/useVxetable";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import EditConfigForm from "./components/EditConfigForm.vue";
import { SearchFormItem } from "@/components/FormView/type";

defineOptions({
  name: "Config"
});

const route = useRoute();

const { YesNoEnum } = toRefs(useDict("YesNoEnum"));

const searchList = reactive<SearchFormItem[]>([
  {
    type: "input",
    prop: "configName",
    label: "参数名称"
  },
  {
    type: "input",
    prop: "configKey",
    label: "参数键名"
  },
  {
    type: "select",
    prop: "configType",
    label: "系统内置",
    props: {
      options: YesNoEnum.value
    }
  },
  {
    type: "date-range",
    prop: "dateRange",
    label: "创建时间",
    props: {
      valueFormat: "YYYY-MM-DD",
      placeholder: ["开始日期", "结束日期"],
      separator: "-"
    }
  }
]);
const apiQuery = reactive<ListConfigDto>({
  dateRange: null,
  beginTime: null,
  endTime: null,
  configName: undefined,
  configKey: undefined,
  configType: undefined
});

const toolbarButtons: BtnOptionsProps[] = [
  {
    btnText: "新增",
    props: {
      type: "primary"
    },
    icon: "ant-design:plus-outlined",
    authCode: "add",
    handleClick: () => {
      handleAdd();
    }
  },
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
    disabled: () => {
      return !selectRows.value.length;
    },
    disabledTooltip: `请先勾选删除项`
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

const gridOptions = reactive<VxeGridProps<SysConfigVo>>({
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
    storage: true, // 存储key VXE_CUSTOM_STORE
    checkMethod({ column }) {
      return !["checkbox", "tools"].includes(column.field);
    }
  },
  columns: [
    { field: "checkbox", type: "checkbox", width: 60, fixed: "left" },
    { field: "configId", title: "参数主键" },
    { field: "configName", title: "参数名称" },
    { field: "configKey", title: "参数键名" },
    { field: "configValue", title: "参数键值" },
    {
      field: "configType",
      title: "系统内置",
      slots: {
        default({ row }) {
          return <dict-tag options={YesNoEnum.value} value={row.configType} />;
        }
      }
    },
    { field: "remark", title: "备注" },
    {
      field: "createTime",
      title: "创建时间",
      width: 150,
      formatter: ({ row }) => {
        return formatToDatetime(row.createTime);
      }
    },
    {
      field: "tools",
      title: "操作",
      width: 210,
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
  getListApi: listConfig,
  apiQuery
});

const rowButtons: BtnOptionsProps<SysConfigVo>[] = [
  {
    btnText: "修改",
    props: {
      type: "primary"
    },
    icon: "ant-design:edit-outlined",
    authCode: "edit",
    handleClick: ({ row }) => {
      handleUpdate(row);
    }
  },
  {
    btnText: "删除",
    props: {
      type: "primary",
      danger: true
    },
    icon: "ant-design:delete-outlined",
    authCode: "remove",
    handleClick: ({ row }) => {
      handleDelete(row);
    }
  }
];

initListSearch();

/** 重置按钮操作 */
function handleReset() {
  resetListSearch();
}

/** 删除按钮操作 */
function handleDelete(row = null) {
  const ids = unref(selectRows).map(item => item.configId);
  const configIds = (row ? [row.configId] : ids).join(",");
  $feedback
    .confirm('是否确认删除参数编号为"' + configIds + '"的数据项？')
    .then(function () {
      return delConfig(configIds);
    })
    .then(() => {
      initListSearch();
      $feedback.message.success("删除成功");
    })
    .catch(() => {});
}

/** 导出按钮操作 */
function handleExport() {
  $file.download(
    "system/config/export",
    {
      pageNum: gridOptions.pagerConfig.currentPage,
      pageSize: gridOptions.pagerConfig.pageSize,
      ...apiQuery
    },
    `config_${dateUtil().format("YYYYMMDDHHmmss")}.xlsx`
  );
}

/*** 用户编辑弹窗参数 */
const editDialog = reactive({
  // 是否显示弹出层（用户导入）
  open: false,
  // 弹出层标题（用户导入）
  title: "",
  configId: undefined
});
/** 新增按钮操作 */
function handleAdd() {
  editDialog.configId = undefined;
  editDialog.open = true;
  editDialog.title = "添加参数";
}
/** 修改按钮操作 */
function handleUpdate(row) {
  editDialog.configId = row.configId;
  editDialog.open = true;
  editDialog.title = "修改参数";
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
      <template #tools_slot="data">
        <ToolButtons :buttons="rowButtons" :data="data" :maxShowNum="2" />
      </template>
    </vxe-grid>

    <!-- 添加或修改对话框 -->
    <a-modal v-model:open="editDialog.open" :title="editDialog.title" width="800px" :footer="null" destroy-on-close>
      <EditConfigForm v-if="editDialog.open" :configId="editDialog.configId" @success="initListSearch" @cancel="editDialog.open = false" />
    </a-modal>
  </div>
</template>

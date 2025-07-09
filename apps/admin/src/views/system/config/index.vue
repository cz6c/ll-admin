<script setup lang="tsx">
import { listConfig, delConfig } from "@/api/system/config";
import { ListConfigDto, SysConfigVo } from "#/api/system/config";
import { formatToDatetime } from "@llcz/common";
import $feedback from "@/utils/feedback";
import $file from "@/utils/file";
import { useDict } from "@/hooks/useDict";
import { VxeGridProps } from "vxe-table";
import { useTable } from "@/hooks/useVxetable";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import EditConfigForm from "./components/EditConfigForm.vue";
import { SearchProps } from "@/components/SearchForm/type";

defineOptions({
  name: "Config"
});

const route = useRoute();

const { YesNoEnum } = toRefs(useDict("YesNoEnum"));

const searchList = reactive<SearchProps[]>([
  {
    el: "input",
    prop: "configName",
    label: "参数名称"
  },
  {
    el: "input",
    prop: "configKey",
    label: "参数键名"
  },
  {
    el: "select",
    prop: "configType",
    label: "系统内置",
    options: YesNoEnum
  },
  {
    el: "date-picker",
    prop: "dateRange",
    label: "创建时间",
    props: {
      type: "daterange",
      valueFormat: "YYYY-MM-DD",
      rangeSeparator: "-",
      startPlaceholder: "开始日期",
      endPlaceholder: "结束日期"
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
      type: "primary",
      plain: true,
      icon: "Plus"
    },
    authCode: "add",
    handleClick: () => {
      handleAdd();
    }
  },
  {
    btnText: "删除",
    props: {
      type: "danger",
      plain: true,
      icon: "Delete"
    },
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
      type: "primary",
      plain: true,
      icon: "Edit"
    },
    authCode: "edit",
    handleClick: ({ row }) => {
      handleUpdate(row);
    }
  },
  {
    btnText: "删除",
    props: {
      type: "danger",
      plain: true,
      icon: "Delete"
    },
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
    `config_${new Date().getTime()}.xlsx`
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
  <div class="app-page cz-card pt-16">
    <!--表格数据-->
    <vxe-grid ref="gridRef" v-bind="gridOptions" v-on="gridEvents">
      <template #form>
        <SearchForm :columns="searchList" :search-param="apiQuery" @search="initListSearch" @reset="handleReset" />
      </template>
      <template #toolbar_buttons>
        <ToolButtons :buttons="toolbarButtons" size="default" />
      </template>
      <template #tools_slot="data">
        <ToolButtons :buttons="rowButtons" :data="data" :maxShowNum="2" />
      </template>
    </vxe-grid>

    <!-- 添加或修改对话框 -->
    <el-dialog v-model="editDialog.open" :title="editDialog.title" width="800px" append-to-body>
      <EditConfigForm
        v-if="editDialog.open"
        :configId="editDialog.configId"
        @success="initListSearch"
        @cancel="editDialog.open = false"
      />
    </el-dialog>
  </div>
</template>

<script setup lang="tsx">
import { changeRoleStatus, delRole, listRole } from "@/api/system/role";
import { ListRoleDto, SysRoleVo } from "#/api/system/role";
import { formatToDatetime } from "@llcz/common";
import $feedback from "@/utils/feedback";
import $file from "@/utils/file";
import { useDict } from "@/hooks/useDict";
import EditRoleForm from "./components/EditRoleForm.vue";
import { SearchProps } from "@/components/SearchForm/type";
import { VxeGridProps } from "vxe-table";
import { useTable } from "@/hooks/useVxetable";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";

defineOptions({
  name: "Role"
});

const route = useRoute();

const { StatusEnum } = toRefs(useDict("StatusEnum"));

const searchList = reactive<SearchProps[]>([
  {
    el: "input",
    prop: "roleName",
    label: "角色名称"
  },
  {
    el: "input",
    prop: "roleKey",
    label: "权限字符"
  },
  {
    el: "select",
    prop: "status",
    label: "角色状态",
    options: StatusEnum
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
const apiQuery = reactive<ListRoleDto>({
  dateRange: null,
  beginTime: null,
  endTime: null,
  roleName: undefined,
  roleKey: undefined,
  status: undefined
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

const gridOptions = reactive<VxeGridProps<SysRoleVo>>({
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
    { field: "roleId", title: "角色编号" },
    { field: "roleName", title: "角色名称" },
    { field: "roleKey", title: "权限字符" },
    { field: "roleSort", title: "显示顺序" },
    {
      field: "status",
      title: "状态",
      slots: {
        default({ row }) {
          return <el-switch v-model={row.status} active-value="0" inactive-value="1" onChange={() => handleStatusChange(row)} />;
        }
      }
    },
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
  getListApi: listRole,
  apiQuery
});

const rowButtons: BtnOptionsProps<SysRoleVo>[] = [
  {
    btnText: "修改",
    props: {
      type: "primary",
      plain: true,
      icon: "Edit"
    },
    authCode: "edit",
    disabled: ({ row }) => {
      return row.roleId === 1;
    },
    disabledTooltip: `禁止修改超级管理员角色`,
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
    disabled: ({ row }) => {
      return row.roleId === 1;
    },
    disabledTooltip: `禁止删除超级管理员角色`,
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
  const ids = unref(selectRows).map(item => item.roleId);
  const roleIds = (row ? [row.roleId] : ids).join(",");
  $feedback
    .confirm('是否确认删除角色编号为"' + roleIds + '"的数据项?')
    .then(function () {
      return delRole(roleIds);
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
    "system/role/export",
    {
      pageNum: gridOptions.pagerConfig.currentPage,
      pageSize: gridOptions.pagerConfig.pageSize,
      ...apiQuery
    },
    `role_${new Date().getTime()}.xlsx`
  );
}
/** 角色状态修改 */
function handleStatusChange(row) {
  let text = row.status === "0" ? "启用" : "停用";
  $feedback
    .confirm('确认要"' + text + '""' + row.roleName + '"角色吗?')
    .then(function () {
      return changeRoleStatus({ roleId: row.roleId, status: row.status });
    })
    .then(() => {
      $feedback.message.success(text + "成功");
    })
    .catch(function () {
      row.status = row.status === "0" ? "1" : "0";
    });
}

/*** 角色编辑弹窗参数 */
const editDialog = reactive({
  // 是否显示弹出层
  open: false,
  // 弹出层标题
  title: "",
  roleId: undefined
});

/** 添加角色 */
function handleAdd() {
  editDialog.roleId = undefined;
  editDialog.open = true;
  editDialog.title = "添加角色";
}
/** 修改角色 */
function handleUpdate(row) {
  editDialog.roleId = row.roleId;
  editDialog.open = true;
  editDialog.title = "修改角色";
}
</script>

<template>
  <div class="app-page cz-card">
    <!-- 表格数据 -->
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
      <EditRoleForm v-if="editDialog.open" :roleId="editDialog.roleId" @success="initListSearch" @cancel="editDialog.open = false" />
    </el-dialog>
  </div>
</template>

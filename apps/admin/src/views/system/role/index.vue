<script setup lang="tsx">
import { changeRoleStatus, delRole, listRole } from "@/api/system/role";
import { ListRoleDto, SysRoleVo } from "#/api/system/role";
import { dateUtil, formatToDatetime } from "@llcz/common";
import $feedback from "@/utils/feedback";
import $file from "@/utils/file";
import { useDict } from "@/hooks/useDict";
import EditRoleForm from "./components/EditRoleForm.vue";
import { SearchFormItem } from "@/components/FormView/type";
import { VxeGridProps } from "vxe-table";
import type { VxeGridBindOptions } from "#/vxe-grid";
import { useTable } from "@/hooks/useVxetable";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";

defineOptions({
  name: "Role"
});

const route = useRoute();

const { StatusEnum } = toRefs(useDict("StatusEnum"));

const searchList = reactive<SearchFormItem[]>([
  {
    type: "input",
    prop: "roleName",
    label: "角色名称"
  },
  {
    type: "input",
    prop: "roleKey",
    label: "权限字符"
  },
  {
    type: "select",
    prop: "status",
    label: "角色状态",
    props: {
      options: StatusEnum.value
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
    { field: "roleId", title: "角色编号" },
    { field: "roleName", title: "角色名称" },
    { field: "roleKey", title: "权限字符" },
    { field: "roleSort", title: "显示顺序" },
    {
      field: "status",
      title: "状态",
      slots: {
        default({ row }) {
          return <a-switch v-model:checked={row.status} checkedValue="0" unCheckedValue="1" onChange={() => handleStatusChange(row)} />;
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
      type: "primary"
    },
    icon: "ant-design:edit-outlined",
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
      type: "primary",
      danger: true
    },
    icon: "ant-design:delete-outlined",
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
    `role_${dateUtil().format("YYYYMMDDHHmmss")}.xlsx`
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
      <EditRoleForm v-if="editDialog.open" :roleId="editDialog.roleId" @success="initListSearch" @cancel="editDialog.open = false" />
    </a-modal>
  </div>
</template>

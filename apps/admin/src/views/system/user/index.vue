<script setup lang="tsx">
import { changeUserStatus, listUser, resetUserPwd, delUser } from "@/api/system/user";
import { SysUserListParams, UserVo } from "#/api/system/user";
import { deptTreeSelect } from "@/api/system/dept";
import { dateUtil, formatToDatetime } from "@llcz/common";
import $feedback from "@/utils/feedback";
import $file from "@/utils/file";
import { useDict } from "@/hooks/useDict";
import type { Key } from "ant-design-vue/es/_util/type";
import ImportTemp from "@/components/ImportTemp/index.vue";
import { VxeGridProps } from "vxe-table";
import type { VxeGridBindOptions } from "#/vxe-grid";
import { useTable } from "@/hooks/useVxetable";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import EditUserForm from "./components/EditUserForm.vue";
import { SearchFormItem } from "@/components/FormView/type";

defineOptions({
  name: "User"
});

const route = useRoute();

const { UserSexEnum, StatusEnum, UserTypeEnum } = toRefs(useDict("UserSexEnum", "StatusEnum", "UserTypeEnum"));

const searchList = reactive<SearchFormItem[]>([
  {
    type: "input",
    prop: "userName",
    label: "用户账号"
  },
  {
    type: "input",
    prop: "phonenumber",
    label: "手机号码"
  },
  {
    type: "input",
    prop: "source",
    label: "拉新来源",
    props: {
      placeholder: "如 group_a / share"
    }
  },
  {
    type: "select",
    prop: "status",
    label: "用户状态",
    props: {
      options: StatusEnum.value
    }
  },
  {
    type: "date-range",
    prop: "dateRange",
    label: "注册时间",
    props: {
      valueFormat: "YYYY-MM-DD",
      placeholder: ["开始日期", "结束日期"],
      separator: "-"
    }
  }
]);
const apiQuery = reactive<SysUserListParams>({
  dateRange: null,
  beginTime: null,
  endTime: null,
  orderByColumn: null,
  order: null,
  userName: undefined,
  phonenumber: undefined,
  source: undefined,
  status: undefined,
  deptId: undefined
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
    btnText: "导入",
    props: {},
    icon: "ant-design:upload-outlined",
    authCode: "import",
    handleClick: () => {
      handleImport();
    }
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

const gridOptions = reactive<VxeGridProps<UserVo>>({
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
    { field: "userId", title: "用户编号" },
    { field: "userName", title: "用户账号" },
    { field: "nickName", title: "用户昵称" },
    { field: "dept.deptName", title: "部门" },
    { field: "phonenumber", title: "手机号码" },
    { field: "source", title: "拉新来源", minWidth: 120 },
    {
      field: "sex",
      title: "性别",
      slots: {
        default({ row }) {
          return <dict-tag options={UserSexEnum.value} value={row.sex} />;
        }
      }
    },
    {
      field: "userType",
      title: "用户类型",
      slots: {
        default({ row }) {
          return <dict-tag options={UserTypeEnum.value} value={row.userType} />;
        }
      }
    },
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
      width: 220,
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
  getListApi: listUser,
  apiQuery
});

const rowButtons: BtnOptionsProps<UserVo>[] = [
  {
    btnText: "修改",
    props: {
      type: "primary"
    },
    icon: "ant-design:edit-outlined",
    authCode: "edit",
    disabled: ({ row }) => {
      return row.userId === 1;
    },
    disabledTooltip: `禁止修改超级管理员信息`,
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
      return row.userType === "00";
    },
    disabledTooltip: `禁止删除系统角色`,
    handleClick: ({ row }) => {
      handleDelete(row);
    }
  },
  {
    btnText: "重置密码",
    props: {},
    icon: "ant-design:delete-outlined",
    authCode: "resetPwd",
    disabled: ({ row }) => {
      return row.userId === 1;
    },
    disabledTooltip: `禁止修改超级管理员信息`,
    handleClick: ({ row }) => {
      handleResetPwd(row);
    }
  }
];

// ---部门树逻辑（ant Tree：本地过滤 + selectedKeys）---
const deptName = ref("");
const deptOptions = ref([]);
const deptSelectedKeys = ref<Key[]>([]);

/** 按名称过滤部门树（保留匹配节点及其祖先） */
function filterDeptTree(nodes: any[], keyword: string) {
  if (!keyword) return nodes || [];
  const result = [];
  for (const node of nodes || []) {
    const children = filterDeptTree(node.children, keyword);
    if (String(node.deptName || "").includes(keyword) || children.length) {
      result.push({ ...node, children });
    }
  }
  return result;
}
const filteredDeptOptions = computed(() => filterDeptTree(deptOptions.value, deptName.value));

/** 查询部门下拉树结构 */
async function getDeptTree() {
  const { data } = await deptTreeSelect();
  deptOptions.value = data;
}
/** 节点选中事件 */
function handleNodeSelect(keys: Key[]) {
  apiQuery.deptId = keys[0] != null ? Number(keys[0]) : undefined;
  initListSearch();
}

/** 重置按钮操作 */
function handleReset() {
  resetListSearch();
  deptSelectedKeys.value = [];
}

/** 删除按钮操作 */
function handleDelete(row = null) {
  const ids = unref(selectRows)
    .filter(({ userType }) => userType !== "00")
    .map(item => item.userId);
  const userIds = (row ? [row.userId] : ids).join(",");
  $feedback
    .confirm('是否确认删除用户编号为"' + userIds + '"的数据项？')
    .then(() => {
      return delUser(userIds);
    })
    .then(() => {
      initListSearch();
      $feedback.message.success("删除成功");
    })
    .catch(() => {});
}
/** 用户状态修改  */
function handleStatusChange(row) {
  let text = row.status === "0" ? "启用" : "停用";
  $feedback
    .confirm('确认要"' + text + '""' + row.userName + '"用户吗?')
    .then(() => {
      return changeUserStatus({ userId: row.userId, status: row.status });
    })
    .then(() => {
      $feedback.message.success(text + "成功");
    })
    .catch(function () {
      row.status = row.status === "0" ? "1" : "0";
    });
}
/** 重置密码：经 feedback.confirmInput 收集并校验 */
async function handleResetPwd(row) {
  try {
    const password = await $feedback.confirmInput(`请输入"${row.userName}"的新密码`, {
      password: true,
      placeholder: "长度 5-20 位",
      validate: v => (!/^.{5,20}$/.test(v) ? "用户密码长度必须介于 5 和 20 之间" : undefined)
    });
    await resetUserPwd({ userId: row.userId, password });
    $feedback.message.success("修改成功");
  } catch {
    /* 用户取消 */
  }
}

/*** 用户导入弹窗参数 */
const uploadDialog = reactive({
  // 是否显示弹出层（用户导入）
  open: false,
  // 弹出层标题（用户导入）
  title: ""
});
/** 导入按钮操作 */
function handleImport() {
  uploadDialog.title = "用户导入";
  uploadDialog.open = true;
}

/** 导出按钮操作 */
function handleExport() {
  $file.download(
    "system/user/export",
    {
      pageNum: gridOptions.pagerConfig.currentPage,
      pageSize: gridOptions.pagerConfig.pageSize,
      ...apiQuery
    },
    `user_${dateUtil().format("YYYYMMDDHHmmss")}.xlsx`
  );
}

/*** 用户编辑弹窗参数 */
const editDialog = reactive({
  // 是否显示弹出层（用户导入）
  open: false,
  // 弹出层标题（用户导入）
  title: "",
  userId: undefined
});
/** 新增按钮操作 */
function handleAdd() {
  editDialog.userId = undefined;
  editDialog.open = true;
  editDialog.title = "添加用户";
}
/** 修改按钮操作 */
function handleUpdate(row) {
  editDialog.userId = row.userId;
  editDialog.open = true;
  editDialog.title = "修改用户";
}

initListSearch();
getDeptTree();
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
      <template #left>
        <!--部门数据-->
        <div class="mr-8">
          <a-input v-model:value="deptName" placeholder="请输入部门名称" allow-clear style="margin-bottom: 20px">
            <template #prefix>
              <IconifyIcon icon="ant-design:search-outlined" />
            </template>
          </a-input>
          <a-tree
            v-model:selectedKeys="deptSelectedKeys"
            :tree-data="filteredDeptOptions"
            :field-names="{ title: 'deptName', key: 'deptId', children: 'children' }"
            default-expand-all
            :selectable="true"
            @select="handleNodeSelect"
          />
        </div>
      </template>
      <template #tools_slot="data">
        <ToolButtons :buttons="rowButtons" :data="data" :maxShowNum="2" />
      </template>
    </vxe-grid>

    <!-- 添加或修改对话框 -->
    <a-modal v-model:open="editDialog.open" :title="editDialog.title" width="800px" :footer="null" destroy-on-close>
      <EditUserForm v-if="editDialog.open" :deptOptions="deptOptions" :userId="editDialog.userId" @success="initListSearch" @cancel="editDialog.open = false" />
    </a-modal>
    <!-- 导入对话框 -->
    <a-modal v-model:open="uploadDialog.open" :title="uploadDialog.title" width="400px" :footer="null" destroy-on-close>
      <ImportTemp
        v-if="uploadDialog.open"
        importUrl="/system/user/importData"
        importTempUrl="system/user/importTemplate"
        filePrefix="user_"
        @success="initListSearch"
        @cancel="uploadDialog.open = false"
      />
    </a-modal>
  </div>
</template>

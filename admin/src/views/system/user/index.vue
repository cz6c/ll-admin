<script setup lang="tsx">
import { changeUserStatus, listUser, resetUserPwd, delUser } from "@/api/system/user";
import { deptTreeSelect } from "@/api/system/dept";
import { parseTime } from "@/utils";
import { useDict } from "@/hooks/useDict";
import { TreeInstance } from "element-plus";
import ImportTemp from "@/components/ImportTemp/index.vue";
import { VxeGridProps } from "vxe-table";
import { SysUserListParams, UserVo } from "#/api/system/user";
import { useTable } from "@/hooks/useVxetable";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import EditUserForm from "./components/EditUserForm.vue";
import { SearchProps } from "@/components/SearchForm/type";

defineOptions({
  name: "User"
});
const { proxy } = getCurrentInstance();
const route = useRoute();

const { UserSexEnum, StatusEnum, UserTypeEnum } = toRefs(useDict("UserSexEnum", "StatusEnum", "UserTypeEnum"));

const searchList = reactive<SearchProps[]>([
  {
    el: "input",
    prop: "userName",
    label: "用户账号"
  },
  {
    el: "input",
    prop: "phonenumber",
    label: "手机号码"
  },
  {
    el: "select",
    prop: "status",
    label: "用户状态",
    options: StatusEnum
  },
  {
    el: "date-picker",
    prop: "dateRange",
    label: "下单时间",
    props: {
      type: "daterange",
      valueFormat: "YYYY-MM-DD",
      rangeSeparator: "-",
      startPlaceholder: "开始日期",
      endPlaceholder: "结束日期"
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
  status: undefined,
  deptId: undefined
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
    btnText: "导入",
    props: {
      type: "info",
      plain: true,
      icon: "Upload"
    },
    authCode: "import",
    handleClick: () => {
      handleImport();
    }
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
    { field: "userId", title: "用户编号" },
    { field: "userName", title: "用户账号" },
    { field: "nickName", title: "用户昵称" },
    { field: "dept.deptName", title: "部门" },
    { field: "phonenumber", title: "手机号码" },
    {
      field: "sex",
      title: "性别",
      slots: {
        default({ row }) {
          return <dict-tag options={UserSexEnum.value} value={row.userType} />;
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
          return (
            <el-switch
              v-model={row.status}
              active-value="0"
              inactive-value="1"
              onChange={() => handleStatusChange(row)}
            />
          );
        }
      }
    },
    {
      field: "createTime",
      title: "创建时间",
      width: 150,
      formatter: ({ row }) => {
        return parseTime(row.createTime);
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
  getListApi: listUser,
  apiQuery
});

const rowButtons: BtnOptionsProps<UserVo>[] = [
  {
    btnText: "修改",
    props: {
      type: "primary",
      plain: true,
      icon: "Edit"
    },
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
      type: "danger",
      plain: true,
      icon: "Delete"
    },
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
    props: {
      type: "warning",
      plain: true,
      icon: "Delete"
    },
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

// ---部门树逻辑---
const deptName = ref("");
const deptOptions = ref(undefined);
const deptTreeRef = ref<TreeInstance>(null);
/** 通过条件过滤节点  */
const filterNode = (value: string, data) => {
  if (!value) return true;
  let labelKey = unref(deptTreeRef).store.props.label as string;
  return data[labelKey].indexOf(value) !== -1;
};
/** 根据名称筛选部门树 */
watch(deptName, val => {
  unref(deptTreeRef).filter(val);
});
/** 查询部门下拉树结构 */
async function getDeptTree() {
  const { data } = await deptTreeSelect();
  deptOptions.value = data;
}
/** 节点单击事件 */
function handleNodeClick(data) {
  let key = unref(deptTreeRef).store.key;
  apiQuery.deptId = data[key];
  initListSearch();
}

/** 重置按钮操作 */
function handleReset() {
  resetListSearch();
  unref(deptTreeRef).setCurrentKey(null);
}

/** 删除按钮操作 */
function handleDelete(row = null) {
  const ids = unref(selectRows)
    .filter(({ userType }) => userType !== "00")
    .map(item => item.userId);
  const userIds = (row ? [row.userId] : ids).join(",");
  proxy.$modal
    .confirm('是否确认删除用户编号为"' + userIds + '"的数据项？')
    .then(() => {
      return delUser(userIds);
    })
    .then(() => {
      initListSearch();
      proxy.$message.success("删除成功");
    })
    .catch(() => {});
}
/** 用户状态修改  */
function handleStatusChange(row) {
  let text = row.status === "0" ? "启用" : "停用";
  proxy.$modal
    .confirm('确认要"' + text + '""' + row.userName + '"用户吗?')
    .then(() => {
      return changeUserStatus({ userId: row.userId, status: row.status });
    })
    .then(() => {
      proxy.$message.success(text + "成功");
    })
    .catch(function () {
      row.status = row.status === "0" ? "1" : "0";
    });
}
/** 重置密码按钮操作 */
function handleResetPwd(row) {
  ElMessageBox.prompt('请输入"' + row.userName + '"的新密码', "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    closeOnClickModal: false,
    inputPattern: /^.{5,20}$/,
    inputErrorMessage: "用户密码长度必须介于 5 和 20 之间"
  })
    .then(({ value }) => {
      return resetUserPwd({ userId: row.userId, password: value });
    })
    .then(() => {
      proxy.$message.success("修改成功");
    })
    .catch(() => {});
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
  proxy.$file.download(
    "system/user/export",
    {
      pageNum: gridOptions.pagerConfig.currentPage,
      pageSize: gridOptions.pagerConfig.pageSize,
      ...apiQuery
    },
    `user_${new Date().getTime()}.xlsx`
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
  <div class="app-page cz-card pt-16">
    <!--用户数据-->
    <vxe-grid ref="gridRef" v-bind="gridOptions" v-on="gridEvents">
      <template #form>
        <SearchForm :columns="searchList" :search-param="apiQuery" @search="initListSearch" @reset="handleReset" />
      </template>
      <template #toolbar_buttons>
        <ToolButtons :buttons="toolbarButtons" size="default" />
      </template>
      <template #left>
        <!--部门数据-->
        <div class="mr-8">
          <el-input
            v-model="deptName"
            placeholder="请输入部门名称"
            clearable
            prefix-icon="Search"
            style="margin-bottom: 20px"
          />
          <el-tree
            ref="deptTreeRef"
            :data="deptOptions"
            :props="{ label: 'deptName', children: 'children' }"
            :expand-on-click-node="false"
            :filter-node-method="filterNode"
            node-key="deptId"
            highlight-current
            default-expand-all
            @node-click="handleNodeClick"
          />
        </div>
      </template>
      <template #tools_slot="data">
        <ToolButtons :buttons="rowButtons" :data="data" :maxShowNum="2" />
      </template>
    </vxe-grid>

    <!-- 添加或修改用户配置对话框 -->
    <el-dialog v-model="editDialog.open" :title="editDialog.title" width="800px" append-to-body>
      <EditUserForm
        v-if="editDialog.open"
        :deptOptions="deptOptions"
        :userId="editDialog.userId"
        @success="initListSearch"
        @cancel="editDialog.open = false"
      />
    </el-dialog>
    <!-- 用户导入对话框 -->
    <el-dialog v-model="uploadDialog.open" :title="uploadDialog.title" width="400px" append-to-body>
      <ImportTemp
        v-if="uploadDialog.open"
        importUrl="/system/user/importData"
        importTempUrl="system/user/importTemplate"
        filePrefix="user_"
        @success="initListSearch"
        @cancel="uploadDialog.open = false"
      />
    </el-dialog>
  </div>
</template>

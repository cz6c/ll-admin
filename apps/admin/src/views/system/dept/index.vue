<script setup lang="tsx">
import { deptTreeSelect, delDept } from "@/api/system/dept";
import { DeptTreeVo, ListDeptDto } from "#/api/system/dept";
import { parseTime } from "@/utils";
import $feedback from "@/utils/feedback";
import { useDict } from "@/hooks/useDict";
import { SearchProps } from "@/components/SearchForm/type";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import { VxeGridProps } from "vxe-table";
import { useTable } from "@/hooks/useVxetable";
import EditDeptForm from "./components/EditDeptForm.vue";
import { findPath } from "@packages/common";

defineOptions({
  name: "Dept"
});

const route = useRoute();

const { StatusEnum } = toRefs(useDict("StatusEnum"));

const searchList = reactive<SearchProps[]>([
  {
    el: "input",
    prop: "deptName",
    label: "部门名称"
  },
  {
    el: "select",
    prop: "status",
    label: "部门状态",
    options: StatusEnum
  }
]);
const apiQuery = reactive<ListDeptDto>({
  deptName: undefined,
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
      handleAdd(null);
    }
  },
  {
    btnText: "展开/折叠",
    props: {
      type: "info",
      plain: true,
      icon: "Sort"
    },
    handleClick: () => {
      expandAllChange();
    }
  }
];

const gridOptions = reactive<VxeGridProps<DeptTreeVo>>({
  height: "auto",
  loading: true,
  treeConfig: {
    childrenField: "children"
    // transform: true,
    // rowField: "menuId",
    // parentField: "parentId"
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
      return !["deptName", "tools"].includes(column.field);
    }
  },
  columns: [
    { field: "deptName", title: "部门名称", treeNode: true, fixed: "left" },
    { field: "orderNum", title: "排序" },
    {
      field: "status",
      title: "状态",
      slots: {
        default({ row }) {
          return <dict-tag options={StatusEnum.value} value={row.status} />;
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
      width: 240,
      fixed: "right",
      slots: {
        default: "tools_slot"
      }
    }
  ],
  data: []
});

const { gridRef, gridEvents, initListSearch, resetListSearch } = useTable({
  gridOptions,
  getListApi: deptTreeSelect,
  apiQuery
});

const rowButtons: BtnOptionsProps<DeptTreeVo>[] = [
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
    btnText: "子级",
    props: {
      type: "primary",
      plain: true,
      icon: "Plus"
    },
    authCode: "add",
    handleClick: ({ row }) => {
      handleAdd(row);
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

const expandAll = ref(false);
/**
 * @description: 展开收缩全部行
 */
function expandAllChange() {
  expandAll.value = !expandAll.value;
  unref(expandAll) && unref(gridRef).setAllTreeExpand(true);
  !unref(expandAll) && unref(gridRef).clearTreeExpand();
}

/** 删除按钮操作 */
function handleDelete(row) {
  $feedback
    .confirm('是否确认删除名称为"' + row.deptName + '"的数据项?')
    .then(function () {
      return delDept(row.deptId);
    })
    .then(() => {
      initListSearch();
      $feedback.message.success("删除成功");
    })
    .catch(() => {});
}

/*** 角色编辑弹窗参数 */
const editDialog = reactive({
  // 是否显示弹出层
  open: false,
  // 弹出层标题
  title: "",
  deptId: undefined,
  parentId: undefined,
  parentName: ""
});

/** 新增按钮操作 */
function handleAdd(row) {
  editDialog.deptId = undefined;
  editDialog.parentId = row ? row.deptId : 0;
  editDialog.parentName = row
    ? findPath(gridOptions.data, c => c.deptName === row.deptName)
        .map(c => c.deptName)
        .join(">")
    : "";
  editDialog.title = row ? "添加子部门" : "添加部门";
  editDialog.open = true;
}
/** 修改按钮操作 */
function handleUpdate(row) {
  editDialog.deptId = row.deptId;
  editDialog.title = "修改部门";
  editDialog.open = true;
}
</script>

<template>
  <div class="app-page cz-card pt-16">
    <!-- 表格数据 -->
    <vxe-grid ref="gridRef" v-bind="gridOptions" v-on="gridEvents">
      <template #form>
        <SearchForm :columns="searchList" :search-param="apiQuery" @search="initListSearch" @reset="handleReset" />
      </template>
      <template #toolbar_buttons>
        <ToolButtons :buttons="toolbarButtons" size="default" />
      </template>
      <template #tools_slot="data">
        <ToolButtons :buttons="rowButtons" :data="data" />
      </template>
    </vxe-grid>

    <!-- 添加或修改对话框 -->
    <el-dialog v-model="editDialog.open" :title="editDialog.title" width="800px" append-to-body>
      <EditDeptForm
        v-if="editDialog.open"
        :deptId="editDialog.deptId"
        :parentId="editDialog.parentId"
        :parentName="editDialog.parentName"
        @success="initListSearch"
        @cancel="editDialog.open = false"
      />
    </el-dialog>
  </div>
</template>

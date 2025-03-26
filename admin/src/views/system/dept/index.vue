<script setup lang="tsx">
import { deptTreeSelect, delDept } from "@/api/system/dept";
import { DeptTreeVo, ListDeptDto } from "#/api/system/dept";
import { parseTime } from "@/utils";
import { useDict } from "@/hooks/useDict";
import { SearchProps } from "@/components/SearchForm/type";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import { VxeGridProps } from "vxe-table";
import { useTable } from "@/hooks/useVxetable";
import EditDeptForm from "./components/EditDeptForm.vue";

defineOptions({
  name: "Dept"
});
const { proxy } = getCurrentInstance();
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
    // visible: ({ row }) => {
    //   return row.menuType === "M" && row.parentId === 0;
    // },
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
  proxy.$modal
    .confirm('是否确认删除名称为"' + row.deptName + '"的数据项?')
    .then(function () {
      return delDept(row.deptId);
    })
    .then(() => {
      initListSearch();
      proxy.$message.success("删除成功");
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
  editDialog.parentName = row ? row.deptName : "";
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

    <!-- <el-form v-show="showSearch" ref="queryRef" :model="queryParams" :inline="true">
      <el-form-item label="部门名称" prop="deptName">
        <el-input
          v-model="queryParams.deptName"
          placeholder="请输入部门名称"
          clearable
          style="width: 200px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-select v-model="queryParams.status" placeholder="部门状态" clearable style="width: 200px">
          <el-option v-for="dict in StatusEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
        <el-button icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button v-auth="'add'" type="primary" plain icon="Plus" @click="handleAdd">新增</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="info" plain icon="Sort" @click="toggleExpandAll">展开/折叠</el-button>
      </el-col>
    </el-row> -->

    <!-- <el-table
      v-if="refreshTable"
      v-loading="loading"
      :data="deptList"
      row-key="deptId"
      :default-expand-all="isExpandAll"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
    >
      <el-table-column prop="deptName" label="部门名称" width="260" />
      <el-table-column prop="orderNum" label="排序" width="200" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="scope">
          <dict-tag :options="StatusEnum" :value="scope.row.status" />
        </template>
      </el-table-column>
      <el-table-column label="创建时间" align="center" prop="createTime" width="200">
        <template #default="scope">
          <span>{{ parseTime(scope.row.createTime) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button v-auth="'edit'" link type="primary" icon="Edit" @click="handleUpdate(scope.row)">修改</el-button>
          <el-button v-auth="'add'" link type="primary" icon="Plus" @click="handleAdd(scope.row)">新增</el-button>
          <el-button
            v-if="scope.row.parentId != 0"
            v-auth="'remove'"
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table> -->

    <!-- 添加或修改部门对话框 -->
    <!-- <el-dialog v-model="open" :title="title" width="600px" append-to-body /> -->
  </div>
</template>

<script setup lang="tsx">
import { listPost, delPost } from "@/api/system/post";
import { ListPostDto, SysPostVo } from "#/api/system/post";
import { formatToDatetime } from "@llcz/common";
import $feedback from "@/utils/feedback";
import $file from "@/utils/file";
import { useDict } from "@/hooks/useDict";
import { VxeGridProps } from "vxe-table";
import { useTable } from "@/hooks/useVxetable";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import EditPostForm from "./components/EditPostForm.vue";
import { SearchFormItem } from "@/components/FormView/type";

defineOptions({
  name: "Post"
});

const route = useRoute();

const { StatusEnum } = toRefs(useDict("StatusEnum"));

const searchList = reactive<SearchFormItem[]>([
  {
    type: "input",
    prop: "postCode",
    label: "岗位编码"
  },
  {
    type: "input",
    prop: "postName",
    label: "岗位名称"
  },
  {
    type: "select",
    prop: "status",
    label: "状态",
    props: {
      options: StatusEnum.value
    }
  }
]);
const apiQuery = reactive<ListPostDto>({
  postCode: undefined,
  postName: undefined,
  status: undefined
});

const toolbarButtons: BtnOptionsProps[] = [
  {
    btnText: "新增",
    props: {
      type: "primary",
      plain: true
    },
    icon: "ep:plus",
    authCode: "add",
    handleClick: () => {
      handleAdd();
    }
  },
  {
    btnText: "删除",
    props: {
      type: "danger",
      plain: true
    },
    icon: "ep:delete",
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
      plain: true
    },
    icon: "ep:download",
    authCode: "export",
    handleClick: () => {
      handleExport();
    }
  }
];

const gridOptions = reactive<VxeGridProps<SysPostVo>>({
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
    { field: "postId", title: "岗位编号" },
    { field: "postCode", title: "岗位编码" },
    { field: "postName", title: "岗位名称" },
    { field: "postSort", title: "岗位排序" },
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
  getListApi: listPost,
  apiQuery
});

const rowButtons: BtnOptionsProps<SysPostVo>[] = [
  {
    btnText: "修改",
    props: {
      type: "primary",
      plain: true
    },
    icon: "ep:edit",
    authCode: "edit",
    handleClick: ({ row }) => {
      handleUpdate(row);
    }
  },
  {
    btnText: "删除",
    props: {
      type: "danger",
      plain: true
    },
    icon: "ep:delete",
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
  const ids = unref(selectRows).map(item => item.postId);
  const postIds = (row ? [row.postId] : ids).join(",");
  $feedback
    .confirm('是否确认删除岗位编号为"' + postIds + '"的数据项？')
    .then(function () {
      return delPost(postIds);
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
    "system/post/export",
    {
      pageNum: gridOptions.pagerConfig.currentPage,
      pageSize: gridOptions.pagerConfig.pageSize,
      ...apiQuery
    },
    `post_${new Date().getTime()}.xlsx`
  );
}

/*** 用户编辑弹窗参数 */
const editDialog = reactive({
  // 是否显示弹出层（用户导入）
  open: false,
  // 弹出层标题（用户导入）
  title: "",
  postId: undefined
});
/** 新增按钮操作 */
function handleAdd() {
  editDialog.postId = undefined;
  editDialog.open = true;
  editDialog.title = "添加岗位";
}
/** 修改按钮操作 */
function handleUpdate(row) {
  editDialog.postId = row.postId;
  editDialog.open = true;
  editDialog.title = "修改岗位";
}
</script>

<template>
  <div class="app-page cz-card">
    <!--表格数据-->
    <vxe-grid ref="gridRef" v-bind="gridOptions" v-on="gridEvents">
      <template #form>
        <SearchForm v-model="apiQuery" :columns="searchList" @search="initListSearch" @reset="handleReset" />
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
      <EditPostForm v-if="editDialog.open" :postId="editDialog.postId" @success="initListSearch" @cancel="editDialog.open = false" />
    </el-dialog>
  </div>
</template>

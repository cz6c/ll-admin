<script setup lang="tsx">
import { listNotice, delNotice } from "@/api/system/notice";
import { ListNoticeDto, SysNoticeVo } from "#/api/system/notice";
import { parseTime } from "@/utils";
import $feedback from "@/utils/feedback";
import { useDict } from "@/hooks/useDict";
import { VxeGridProps } from "vxe-table";
import { useTable } from "@/hooks/useVxetable";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import EditPostForm from "./components/EditNoticeForm.vue";
import { SearchProps } from "@/components/SearchForm/type";

defineOptions({
  name: "Notice"
});

const route = useRoute();

const { StatusEnum, NoticeTypeEnum } = toRefs(useDict("StatusEnum", "NoticeTypeEnum"));

const searchList = reactive<SearchProps[]>([
  {
    el: "input",
    prop: "noticeTitle",
    label: "公告标题"
  },
  {
    el: "input",
    prop: "createBy",
    label: "操作人员"
  },
  {
    el: "select",
    prop: "noticeType",
    label: "公告类型",
    options: NoticeTypeEnum
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
const apiQuery = reactive<ListNoticeDto>({
  dateRange: null,
  beginTime: null,
  endTime: null,
  noticeTitle: undefined,
  createBy: undefined,
  noticeType: undefined
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
  }
];

const gridOptions = reactive<VxeGridProps<SysNoticeVo>>({
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
    { field: "noticeId", title: "公告编号" },
    { field: "noticeTitle", title: "公告标题" },
    {
      field: "noticeType",
      title: "公告类型",
      slots: {
        default({ row }) {
          return <dict-tag options={NoticeTypeEnum.value} value={row.noticeType} />;
        }
      }
    },
    {
      field: "status",
      title: "状态",
      slots: {
        default({ row }) {
          return <dict-tag options={StatusEnum.value} value={row.status} />;
        }
      }
    },
    { field: "createBy", title: "创建者" },
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
  getListApi: listNotice,
  apiQuery
});

const rowButtons: BtnOptionsProps<SysNoticeVo>[] = [
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
  const ids = unref(selectRows).map(item => item.noticeId);
  const noticeIds = (row ? [row.noticeId] : ids).join(",");
  $feedback
    .confirm('是否确认删除公告编号为"' + noticeIds + '"的数据项？')
    .then(function () {
      return delNotice(noticeIds);
    })
    .then(() => {
      initListSearch();
      $feedback.message.success("删除成功");
    })
    .catch(() => {});
}

/*** 用户编辑弹窗参数 */
const editDialog = reactive({
  // 是否显示弹出层（用户导入）
  open: false,
  // 弹出层标题（用户导入）
  title: "",
  noticeId: undefined
});
/** 新增按钮操作 */
function handleAdd() {
  editDialog.noticeId = undefined;
  editDialog.open = true;
  editDialog.title = "添加公告";
}
/** 修改按钮操作 */
function handleUpdate(row) {
  editDialog.noticeId = row.noticeId;
  editDialog.open = true;
  editDialog.title = "修改公告";
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
      <EditPostForm
        v-if="editDialog.open"
        :noticeId="editDialog.noticeId"
        @success="initListSearch"
        @cancel="editDialog.open = false"
      />
    </el-dialog>
  </div>
</template>

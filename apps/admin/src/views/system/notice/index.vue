<script setup lang="tsx">
import { listNotice, delNotice } from "@/api/system/notice";
import { ListNoticeDto, SysNoticeVo } from "#/api/system/notice";
import { formatToDatetime } from "@llcz/common";
import $feedback from "@/utils/feedback";
import { useDict } from "@/hooks/useDict";
import { VxeGridProps } from "vxe-table";
import type { VxeGridBindOptions } from "#/vxe-grid";
import { useTable } from "@/hooks/useVxetable";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import EditPostForm from "./components/EditNoticeForm.vue";
import { SearchFormItem } from "@/components/FormView/type";

defineOptions({
  name: "Notice"
});

const route = useRoute();

const { StatusEnum, NoticeTypeEnum } = toRefs(useDict("StatusEnum", "NoticeTypeEnum"));

const searchList = reactive<SearchFormItem[]>([
  {
    type: "input",
    prop: "noticeTitle",
    label: "公告标题"
  },
  {
    type: "input",
    prop: "createBy",
    label: "操作人员"
  },
  {
    type: "select",
    prop: "noticeType",
    label: "公告类型",
    props: {
      options: NoticeTypeEnum.value
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
  getListApi: listNotice,
  apiQuery
});

const rowButtons: BtnOptionsProps<SysNoticeVo>[] = [
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
      <EditPostForm v-if="editDialog.open" :noticeId="editDialog.noticeId" @success="initListSearch" @cancel="editDialog.open = false" />
    </a-modal>
  </div>
</template>

<script setup lang="tsx" name="MemberUser">
import TableView from "@/components/TableView/index.vue";
import { TableConfig, TableViewInstance } from "@/components/TableView/index.d";
import { useTable } from "@/components/TableView/useTable";
import { SearchProps } from "@/components/SearchForm/type";
import { getMemberListApi, delMemberApi } from "@/api/member/user";
import { MemberItem } from "@/api/member/user/index.d";
import { $message } from "@/utils/message";
import { dayjs } from "element-plus";
import MemberFormDrawer from "./components/MemberFormDrawer.vue";
import { Gender } from "@/api/system/user/index.d";

const getListApi = getMemberListApi;
const delApi = delMemberApi;

const searchList = reactive<SearchProps[]>([
  {
    el: "input",
    prop: "nickname",
    label: "会员昵称"
  }
  // {
  //   el: "date-picker",
  //   prop: "createTime",
  //   label: "创建时间",
  //   props: {
  //     type: "date",
  //   },
  // },
]);

const apiQuery = reactive({
  page: 1,
  limit: 20,
  total: 0,
  nickname: ""
  // createTime: "",
});

const { loading, tableData, reset, search, getList, pagination } = useTable({
  getListApi,
  apiQuery
});
getList();

const tableRef = ref<TableViewInstance>();

const tableConfig = reactive<TableConfig<MemberItem>>({
  title: "会员列表",
  columns: [
    {
      label: "会员账户",
      prop: "username"
    },
    {
      label: "会员昵称",
      prop: "nickname"
    },
    {
      label: "会员头像",
      prop: "avatar",
      render: ({ row: { avatar } }) => <el-image src={avatar} />
    },
    {
      label: "会员生日",
      prop: "birthday"
    },
    {
      label: "会员性别",
      prop: "gender",
      formatter: ({ row: { gender } }) => Gender[gender]
    },
    {
      label: "会员职位",
      prop: "profession"
    },
    {
      label: "创建时间",
      prop: "createTime",
      width: 165,
      formatter: ({ row }) => dayjs(row.createTime).format("YYYY/MM/DD HH:mm:ss")
    },
    {
      label: "操作",
      prop: "action",
      width: 140,
      fixed: "right",
      render: ({ row }) => (
        <>
          <el-button link type="primary" size="small" onClick={() => goForm(row.id)}>
            编辑
          </el-button>
          <el-button link type="danger" size="small" onClick={() => del(row.id)}>
            删除
          </el-button>
        </>
      )
    }
  ],
  pagination
});

/**
 * @description: 新增/编辑
 * @param {*} id
 */
const isEdit = ref(false);
const nowId = ref("");
function goForm(id?: string) {
  nowId.value = id || "";
  isEdit.value = true;
}

/**
 * @description: 删除
 * @param {*} id
 */
async function del(id: string) {
  ElMessageBox.confirm("确定要删除该会员吗?", "删除会员", {
    type: "warning"
  })
    .then(async () => {
      try {
        await delApi({ id });
        getList();
        $message.success(`删除成功`);
      } catch (error: any) {
        $message.error(error.message);
      }
    })
    .catch();
}
</script>

<template>
  <div class="app-page flex flex-col">
    <div class="cz-card mb-10 p16 pb0">
      <SearchForm :columns="searchList" :search-param="apiQuery" @search="search" @reset="reset" />
    </div>
    <div class="cz-card flex-1-hidden px16">
      <TableView ref="tableRef" title="会员列表" :data="tableData" :loading="loading" v-bind="tableConfig">
        <template #header-tools>
          <el-button type="primary" @click="goForm()">新增会员</el-button>
        </template>
      </TableView>
    </div>
    <MemberFormDrawer :id="nowId" v-model="isEdit" @update-list="getList" />
  </div>
</template>

<style lang="scss" scoped></style>

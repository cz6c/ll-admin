<template>
  <div class="app-page">
    <el-form v-show="showSearch" ref="queryRef" :model="queryParams" :inline="true" label-width="68px">
      <el-form-item label="登录地址" prop="ipaddr">
        <el-input
          v-model="queryParams.ipaddr"
          placeholder="请输入登录地址"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="用户名称" prop="userName">
        <el-input
          v-model="queryParams.userName"
          placeholder="请输入用户名称"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-select v-model="queryParams.status" placeholder="登录状态" clearable style="width: 240px">
          <el-option v-for="dict in sys_success_error" :key="dict.value" :label="dict.label" :value="dict.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="登录时间" style="width: 308px">
        <el-date-picker
          v-model="dateRange"
          value-format="YYYY-MM-DD HH:mm:ss"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          :default-time="[new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 1, 1, 23, 59, 59)]"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
        <el-button icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button v-auth="'remove'" type="danger" plain icon="Delete" :disabled="multiple" @click="handleDelete">
          删除
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button v-auth="'remove'" type="danger" plain icon="Delete" @click="handleClean">清空</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button v-auth="'unlock'" type="primary" plain icon="Unlock" :disabled="single" @click="handleUnlock">
          解锁
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button v-auth="'export'" type="warning" plain icon="Download" @click="handleExport">导出</el-button>
      </el-col>
    </el-row>

    <el-table
      ref="logininforRef"
      v-loading="loading"
      :data="logininforList"
      @selection-change="handleSelectionChange"
      @sort-change="handleSortChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column label="访问编号" align="center" prop="infoId" />
      <el-table-column
        label="用户名称"
        align="center"
        prop="userName"
        :show-overflow-tooltip="true"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      />
      <el-table-column label="地址" align="center" prop="ipaddr" :show-overflow-tooltip="true" />
      <el-table-column label="登录地点" align="center" prop="loginLocation" :show-overflow-tooltip="true" />
      <el-table-column label="操作系统" align="center" prop="os" :show-overflow-tooltip="true" />
      <el-table-column label="浏览器" align="center" prop="browser" :show-overflow-tooltip="true" />
      <el-table-column label="登录状态" align="center" prop="status">
        <template #default="scope">
          <dict-tag :options="sys_success_error" :value="scope.row.status" />
        </template>
      </el-table-column>
      <el-table-column label="描述" align="center" prop="msg" :show-overflow-tooltip="true" />
      <el-table-column
        label="访问时间"
        align="center"
        prop="loginTime"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
        width="180"
      >
        <template #default="scope">
          <span>{{ parseTime(scope.row.loginTime) }}</span>
        </template>
      </el-table-column>
    </el-table>

    <pagination
      v-show="total > 0"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      :total="total"
      @pagination="getList"
    />
  </div>
</template>

<script setup lang="ts" name="Logininfor">
import { list, delLogininfor, cleanLogininfor, unlockLogininfor } from "@/api/monitor/logininfor";
import { parseTime, addDateRange } from "@/utils";
import { useDict } from "@/hooks/useDict";

const { proxy } = getCurrentInstance();

const { sys_success_error } = toRefs(useDict("sys_success_error"));

const logininforList = ref([]);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const selectName = ref("");
const total = ref(0);
const dateRange = ref([]);

const queryRef = ref(null);
const logininforRef = ref(null);
// 查询参数
const queryParams = ref({
  pageNum: 1,
  pageSize: 10,
  ipaddr: undefined,
  userName: undefined,
  status: undefined,
  orderByColumn: undefined,
  isAsc: undefined
});

/** 查询登录日志列表 */
function getList() {
  loading.value = true;
  list(addDateRange(queryParams.value, dateRange.value)).then(response => {
    logininforList.value = response.data.list;
    total.value = response.data.total;
    loading.value = false;
  });
}
/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}
/** 重置按钮操作 */
function resetQuery() {
  dateRange.value = [];
  unref(queryRef) && unref(queryRef).resetFields();
  queryParams.value.pageNum = 1;
}
/** 多选框选中数据 */
function handleSelectionChange(selection) {
  ids.value = selection.map(item => item.infoId);
  multiple.value = !selection.length;
  single.value = selection.length != 1;
  selectName.value = selection.map(item => item.userName);
}
/** 排序触发事件 */
function handleSortChange(column, prop, order) {
  queryParams.value.orderByColumn = column.prop;
  queryParams.value.isAsc = column.order;
  getList();
}
/** 删除按钮操作 */
function handleDelete(row) {
  const infoIds = row.infoId || ids.value;
  proxy.$modal
    .confirm('是否确认删除访问编号为"' + infoIds + '"的数据项?')
    .then(function () {
      return delLogininfor(infoIds);
    })
    .then(() => {
      getList();
      proxy.$message.success("删除成功");
    })
    .catch(() => {});
}
/** 清空按钮操作 */
function handleClean() {
  proxy.$modal
    .confirm("是否确认清空所有登录日志数据项?")
    .then(function () {
      return cleanLogininfor();
    })
    .then(() => {
      getList();
      proxy.$message.success("清空成功");
    })
    .catch(() => {});
}
/** 解锁按钮操作 */
function handleUnlock() {
  const userName = selectName.value;
  proxy.$modal
    .confirm('是否确认解锁用户"' + userName + '"数据项?')
    .then(function () {
      return unlockLogininfor(userName);
    })
    .then(() => {
      proxy.$message.success("用户" + userName + "解锁成功");
    })
    .catch(() => {});
}
/** 导出按钮操作 */
function handleExport() {
  proxy.$file.download(
    "monitor/logininfor/export",
    {
      ...queryParams.value
    },
    `config_${new Date().getTime()}.xlsx`
  );
}

getList();
</script>

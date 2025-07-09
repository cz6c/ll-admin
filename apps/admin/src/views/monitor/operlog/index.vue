<template>
  <div class="app-page">
    <el-form v-show="showSearch" ref="queryRef" :model="queryParams" :inline="true" label-width="68px">
      <el-form-item label="系统模块" prop="title">
        <el-input
          v-model="queryParams.title"
          placeholder="请输入系统模块"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="操作人员" prop="operName">
        <el-input
          v-model="queryParams.operName"
          placeholder="请输入操作人员"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-select v-model="queryParams.status" placeholder="操作状态" clearable style="width: 240px">
          <el-option v-for="dict in SuccessErrorEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="操作时间" style="width: 308px">
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
        <el-button v-auth="'remove'" type="danger" plain icon="Delete" :disabled="multiple" @click="handleDelete"
          >删除</el-button
        >
      </el-col>
      <el-col :span="1.5">
        <el-button v-auth="'export'" type="warning" plain icon="Download" @click="handleExport">导出</el-button>
      </el-col>
    </el-row>

    <el-table
      ref="operlogRef"
      v-loading="loading"
      :data="operlogList"
      @selection-change="handleSelectionChange"
      @sort-change="handleSortChange"
    >
      <el-table-column type="selection" width="50" align="center" />
      <el-table-column label="日志编号" align="center" prop="operId" />
      <el-table-column label="系统模块" align="center" prop="title" :show-overflow-tooltip="true" />
      <el-table-column
        label="操作人员"
        align="center"
        width="110"
        prop="operName"
        :show-overflow-tooltip="true"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      />
      <el-table-column label="主机" align="center" prop="operIp" width="130" :show-overflow-tooltip="true" />
      <el-table-column label="操作状态" align="center" prop="status">
        <template #default="scope">
          <dict-tag :options="SuccessErrorEnum" :value="scope.row.status" />
        </template>
      </el-table-column>
      <el-table-column
        label="操作日期"
        align="center"
        prop="operTime"
        width="180"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      >
        <template #default="scope">
          <span>{{ formatToDatetime(scope.row.operTime) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="消耗时间"
        align="center"
        prop="costTime"
        width="110"
        :show-overflow-tooltip="true"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      >
        <template #default="scope">
          <span>{{ scope.row.costTime }}毫秒</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button v-auth="'query'" link type="primary" icon="View" @click="handleView(scope.row)">详细</el-button>
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

    <!-- 操作日志详细 -->
    <el-dialog v-model="open" title="操作日志详细" width="700px" append-to-body>
      <el-form :model="form" label-width="100px">
        <el-row>
          <el-col :span="12">
            <el-form-item label="操作模块：">{{ form.title }}</el-form-item>
            <el-form-item label="登录信息："
              >{{ form.operName }} / {{ form.operIp }} / {{ form.operLocation }}</el-form-item
            >
          </el-col>
          <el-col :span="12">
            <el-form-item label="请求地址：">{{ form.operUrl }}</el-form-item>
            <el-form-item label="请求方式：">{{ form.requestMethod }}</el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="操作方法：">{{ form.method }}</el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="请求参数：">{{ form.operParam }}</el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="返回参数：">{{ form.jsonResult }}</el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="操作状态：">
              <div v-if="form.status === 0">正常</div>
              <div v-else-if="form.status === 1">失败</div>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="消耗时间：">{{ form.costTime }}毫秒</el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="操作时间：">{{ formatToDatetime(form.operTime) }}</el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item v-if="form.status === 1" label="异常信息：">{{ form.errorMsg }}</el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="open = false">关 闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { list, delOperlog } from "@/api/monitor/operlog";
import { addDateRange } from "@/utils";
import { formatToDatetime } from "@llcz/common";
import { useDict } from "@/hooks/useDict";
import $feedback from "@/utils/feedback";
import $file from "@/utils/file";

defineOptions({
  name: "Operlog"
});

const { SuccessErrorEnum } = toRefs(useDict("SuccessErrorEnum"));

const operlogList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const multiple = ref(true);
const total = ref(0);
const dateRange = ref([]);

const queryRef = ref(null);
const operlogRef = ref(null);
const data = reactive({
  form: {
    title: "",
    operName: "",
    status: 1,
    operTime: "",
    errorMsg: "",
    costTime: "",
    jsonResult: "",
    method: "",
    requestMethod: "",
    operParam: "",
    operIp: "",
    operLocation: "",
    operUrl: "",
    businessType: ""
  },
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    title: undefined,
    operName: undefined,
    businessType: undefined,
    status: undefined
  }
});

const { queryParams, form } = toRefs(data);

/** 查询登录日志 */
function getList() {
  loading.value = true;
  list(addDateRange(queryParams.value, dateRange.value)).then(response => {
    console.log("response", response);
    operlogList.value = response.data.list;
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
  ids.value = selection.map(item => item.operId);
  multiple.value = !selection.length;
}
/** 排序触发事件 */
function handleSortChange(column, prop, order) {
  // queryParams.value.orderByColumn = column.prop;
  // queryParams.value.order = column.order;
  getList();
}
/** 详细按钮操作 */
function handleView(row) {
  open.value = true;
  form.value = row;
}
/** 删除按钮操作 */
function handleDelete(row) {
  const operIds = row.operId || ids.value;
  $feedback
    .confirm('是否确认删除日志编号为"' + operIds + '"的数据项?')
    .then(function () {
      return delOperlog(operIds);
    })
    .then(() => {
      getList();
      $feedback.message.success("删除成功");
    })
    .catch(() => {});
}
/** 导出按钮操作 */
function handleExport() {
  $file.download(
    "monitor/operlog/export",
    {
      ...queryParams.value
    },
    `config_${new Date().getTime()}.xlsx`
  );
}

getList();
</script>

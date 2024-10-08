<script setup lang="tsx">
import TableView from "@/components/TableView/index.vue";
import { TableConfig, TableViewInstance } from "@/components/TableView/index.d";
import { useTable } from "@/components/TableView/useTable";
import { SearchProps } from "@/components/SearchForm/type";
import { getOrderListApi, delOrderApi } from "@/api/order";
import { OrderItem, OrderState, PayChannel } from "@/api/order/index.d";
import { dayjs } from "element-plus";
import { enumToOpts } from "@/utils";

defineOptions({
  name: "OrderList"
});
const { proxy } = getCurrentInstance();

const getListApi = getOrderListApi;
const delApi = delOrderApi;

const searchList = reactive<SearchProps[]>([
  {
    el: "input",
    prop: "orderNo",
    label: "订单编号"
  },
  {
    el: "select",
    prop: "orderState",
    label: "订单状态",
    options: enumToOpts(OrderState)
  },
  {
    el: "select",
    prop: "payChannel",
    label: "支付渠道",
    options: enumToOpts(PayChannel)
  },
  {
    el: "input",
    prop: "receiverMobile",
    label: "收货人手机"
  },
  {
    el: "date-picker",
    prop: "createTime",
    label: "下单时间",
    props: {
      type: "datetimerange",
      startPlaceholder: "Start date",
      endPlaceholder: "End date"
    }
  }
]);

const apiQuery = reactive({
  page: 1,
  limit: 20,
  total: 0,
  orderNo: "",
  orderState: "",
  payChannel: "",
  receiverMobile: "",
  createTime: []
});

const { loading, tableData, reset, search, getList, pagination } = useTable({
  getListApi,
  apiQuery,
  beforeFetch(params) {
    if (params.createTime && params.createTime[0] && params.createTime[1]) {
      params.createTimeStart = params.createTime[0];
      params.createTimeEnd = params.createTime[1];
      delete params.createTime;
    }
    return params;
  }
});
getList();

const tableRef = ref<TableViewInstance>();

const tableConfig = reactive<TableConfig<OrderItem>>({
  title: "订单列表",
  columns: [
    {
      label: "订单编号",
      prop: "userName"
    },
    {
      label: "订单状态",
      prop: "orderState",
      formatter: ({ row: { orderState } }) => OrderState[orderState]
    },
    {
      label: "收货人",
      prop: "receiver"
    },
    {
      label: "收货人手机",
      width: 165,
      prop: "receiverMobile"
    },
    {
      label: "收货人完整地址",
      width: 165,
      prop: "receiverAddress"
    },
    {
      label: "商品总价",
      prop: "totalMoney"
    },
    {
      label: "运费",
      prop: "postFee"
    },
    {
      label: "应付金额",
      prop: "payMoney"
    },
    {
      label: "订单备注",
      prop: "buyerMessage"
    },
    {
      label: "支付渠道",
      prop: "payChannel",
      formatter: ({ row: { payChannel } }) => PayChannel[payChannel]
    },
    {
      label: "下单时间",
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
          <el-button link type="primary" size="small" onClick={() => goDetails(row.id)}>
            详情
          </el-button>
          <el-button link type="danger" size="small" onClick={() => del(row.id)}>
            删除
          </el-button>
        </>
      )
    }
  ],
  pagination,
  isSelection: true
});

/**
 * @description: 列表选中
 * @param {*} selection
 */
const selectList = ref<OrderItem[]>([]);
function selectionChange(selection: OrderItem[]) {
  selectList.value = selection || [];
}

/**
 * @description: 订单详情
 * @param {*} id
 */
const router = useRouter();
function goDetails(id: string) {
  router.push({ name: "OrderDetails", query: { id } });
}

/**
 * @description: 删除
 * @param {*} id
 */
async function del(id: string) {
  ElMessageBox.confirm("确定要删除该订单吗?", "删除订单", {
    type: "warning"
  })
    .then(async () => {
      try {
        await delApi({ id });
        getList();
        proxy.$message.success(`删除成功`);
      } catch (error: any) {
        proxy.$message.error(error.message);
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
      <TableView
        ref="tableRef"
        :data="tableData"
        :loading="loading"
        v-bind="tableConfig"
        @selection-change="selectionChange"
      >
        <template #header-tools>
          <el-button type="primary">导出订单</el-button>
        </template>
      </TableView>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>

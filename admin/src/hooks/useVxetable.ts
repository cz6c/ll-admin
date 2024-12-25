import type { VxeGridInstance, VxeGridProps, VxeGridListeners } from "vxe-table";
import $message from "@/utils/message";
import { isFunction, isNull, isUnDef } from "@/utils/is";
import type { ListParams } from "#/api";
import { cloneDeep } from "lodash-es";

export function useTable<T>(gridOptions: VxeGridProps<T>, getListApi: Fn, apiQuery: ListParams) {
  const gridRef = ref<VxeGridInstance<T>>();
  const expandAll = ref(false);
  const selectRows = ref<T[]>([]);
  const apiQueryDefault = cloneDeep(apiQuery);

  /**
   * @description: 展开收缩全部行
   * @param {boolean} val
   */
  function expandAllChange(val: boolean) {
    expandAll.value = val;
    unref(expandAll) && unref(gridRef).setAllTreeExpand(true);
    !unref(expandAll) && unref(gridRef).clearTreeExpand();
  }

  /**
   * @description: 处理列表勾选
   */
  function handleCheckBox() {
    const records = unref(gridRef).getCheckboxRecords(true); // isFull=true 包含完整列表 树列表时缓存子级勾选
    const reserves = unref(gridRef).getCheckboxReserveRecords(false); // isFull=false 包含完整列表 树列表时缓存子级勾选
    console.log("🚀 ~ handleCheckBox ~ reserves:", reserves);
    console.log("🚀 ~ handleCheckBox ~ records:", records);
    const { reserve } = gridOptions.checkboxConfig;
    selectRows.value = reserve ? [...reserves, ...records] : records;
  }

  /**
   * @description: 获取列表数据
   */
  async function getTableData() {
    try {
      gridOptions.loading = true;
      let params = {
        pageNum: gridOptions.pagerConfig.currentPage,
        pageSize: gridOptions.pagerConfig.pageSize,
        ...apiQuery
      };
      const dateRange = Array.isArray(params.dateRange) ? params.dateRange : [];
      params["beginTime"] = dateRange[0];
      params["endTime"] = dateRange[1];
      delete params.dateRange;
      for (const key in params) {
        if (isUnDef(params[key]) || isNull(params[key])) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete params[key];
        }
      }
      const { data } = getListApi && isFunction(getListApi) && (await getListApi(params));
      gridOptions.data = data.list ?? data;
      gridOptions.pagerConfig.total = data.total;
    } catch (error: any) {
      console.log(error);
      $message.warning(error.message);
    } finally {
      gridOptions.loading = false;
    }
  }

  /**
   * @description: 列表搜索
   */
  function resetPageSearch() {
    gridOptions.pagerConfig.currentPage = 1;
    getTableData();
  }

  /**
   * @description: 重置搜索参数
   */
  function resetQuerySearch() {
    Object.assign(apiQuery, apiQueryDefault);
    resetPageSearch();
  }

  // 公共列表事件
  const gridEvents: VxeGridListeners<T> = {
    sortChange({ field, order }) {
      apiQuery.orderByColumn = field;
      apiQuery.order = order === "asc" ? "ascending" : order === "desc" ? "descending" : null;
      gridOptions.pagerConfig.currentPage = 1;
      getTableData();
    },
    pageChange({ pageSize, currentPage }) {
      gridOptions.pagerConfig.currentPage = currentPage;
      gridOptions.pagerConfig.pageSize = pageSize;
      getTableData();
    },
    checkboxChange() {
      handleCheckBox();
    },
    checkboxAll() {
      handleCheckBox();
    }
  };

  return {
    gridRef,
    gridEvents,
    expandAll,
    expandAllChange,
    selectRows,
    resetPageSearch,
    resetQuerySearch
  };
}

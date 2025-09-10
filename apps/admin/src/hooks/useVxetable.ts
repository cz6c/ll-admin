import type { VxeGridInstance, VxeGridProps, VxeGridListeners } from "vxe-table";
import { isFunction } from "@llcz/common";
import { cloneDeep } from "lodash-es";

interface UseTableOpt<T> {
  gridOptions: VxeGridProps<T>;
  getListApi: Fn;
  apiQuery: Record<string, any>;
  beforFn?: Fn;
  afterFn?: Fn;
}

export function useTable<T>({ gridOptions, getListApi, apiQuery, beforFn, afterFn }: UseTableOpt<T>) {
  const gridRef = ref<VxeGridInstance<T>>();
  const selectRows = ref<T[]>([]);
  const apiQueryDefault = cloneDeep(apiQuery);
  const isPager = !!gridOptions.pagerConfig;

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
      let params = { ...apiQuery };
      // 处理日期区间
      if (Object.keys(params).includes("dateRange")) {
        const dateRange = Array.isArray(params.dateRange) ? params.dateRange : [];
        params["beginTime"] = dateRange[0];
        params["endTime"] = dateRange[1];
        delete params.dateRange;
      }
      // 处理分页
      if (isPager) {
        params.pageNum = gridOptions.pagerConfig.currentPage;
        params.pageSize = gridOptions.pagerConfig.pageSize;
      }
      // 前置钩子 列表参数处理
      if (beforFn && isFunction(beforFn)) params = beforFn(params);
      const { data } = getListApi && isFunction(getListApi) && (await getListApi(params));
      // 后置钩子 列表数据处理
      let list = isPager ? data.list : data;
      if (afterFn && isFunction(afterFn)) list = afterFn(list);
      gridOptions.data = list;
      console.log("🚀 ~ getTableData ~ gridOptions.data:", gridOptions.data);
      if (isPager) gridOptions.pagerConfig.total = data.total;
    } catch (error) {
      console.log(error);
    } finally {
      gridOptions.loading = false;
    }
  }

  /**
   * @description: 初始化列表搜索
   */
  function initListSearch() {
    if (isPager) gridOptions.pagerConfig.currentPage = 1;
    getTableData();
  }

  /**
   * @description: 重置列表搜索
   */
  function resetListSearch() {
    Object.assign(apiQuery, apiQueryDefault);
    initListSearch();
  }

  // 公共列表事件
  const gridEvents: VxeGridListeners<T> = {
    // 排序
    sortChange({ field, order }) {
      apiQuery.orderByColumn = field;
      apiQuery.order = order === "asc" ? "ascending" : order === "desc" ? "descending" : null;
      initListSearch();
    },
    // 勾选
    checkboxChange() {
      handleCheckBox();
    },
    checkboxAll() {
      handleCheckBox();
    },
    // 分页
    pageChange({ pageSize, currentPage }) {
      gridOptions.pagerConfig.currentPage = currentPage;
      gridOptions.pagerConfig.pageSize = pageSize;
      getTableData();
    }
  };

  return {
    gridRef,
    gridEvents,
    selectRows,
    initListSearch,
    resetListSearch
  };
}

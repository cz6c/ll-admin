import { GetListParams } from "@/api/public/index.d";
import { isFunction } from "@/utils/is";
import { $message } from "@/utils/message";
import { cloneDeep } from "lodash-es";

export interface Params {
  getListApi: Fn;
  apiQuery: Record<string, any> & GetListParams;
  beforeFetch?: Fn;
  afterFetch?: Fn;
}

export function useTable({ getListApi, apiQuery, beforeFetch, afterFetch }: Params) {
  const state = reactive({
    loading: false,
    tableData: [],
  });
  const apiQueryDefault = cloneDeep(apiQuery);

  /**
   * @description: 获取列表数据
   */
  async function getList() {
    try {
      state.loading = true;
      let params = {};
      for (const key in apiQuery) {
        if (Object.prototype.hasOwnProperty.call(apiQuery, key)) {
          if (apiQuery[key]) params[key] = apiQuery[key];
        }
      }
      if (beforeFetch && isFunction(beforeFetch)) {
        params = beforeFetch(params);
      }
      const { data } = getListApi && isFunction(getListApi) && (await getListApi(params));
      state.tableData = data.list ?? data;
      apiQuery.total = data.total;
      if (afterFetch && isFunction(afterFetch)) {
        state.tableData = (await afterFetch(state.tableData)) || state.tableData;
      }
    } catch (error: any) {
      console.log(error);
      $message.warning(error.message);
    } finally {
      state.loading = false;
    }
  }

  /**
   * @description: 切换pageSize
   * @param {number} pageSize
   */
  const handleSizeChange = (pageSize: number) => {
    apiQuery.page = 1;
    apiQuery.limit = pageSize;
    getList();
  };

  /**
   * @description: 切换currentPage
   * @param {number} currentPage
   */
  const handleCurrentChange = (currentPage: number) => {
    apiQuery.page = currentPage;
    getList();
  };

  /**
   * @description: 搜索
   */
  function search() {
    apiQuery.page = 1;
    getList();
  }

  /**
   * @description: 重置搜索
   */
  function reset() {
    Object.assign(apiQuery, apiQueryDefault);
    getList();
  }

  return {
    ...toRefs(state),
    getList,
    search,
    reset,
    pagination: {
      pageQuery: apiQuery,
      handleSizeChange,
      handleCurrentChange,
    },
  };
}

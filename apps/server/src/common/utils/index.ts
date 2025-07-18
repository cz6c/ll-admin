import * as Lodash from "lodash";

/**
 * 深拷贝
 * @param obj
 * @returns
 */
export function DeepClone(obj: object) {
  return Lodash.cloneDeep(obj);
}

/**
 * 数组去重
 * @param list
 * @returns
 */
export function Uniq(list: Array<number | string>) {
  return Lodash.uniq(list);
}

/**
 * 分页
 * @param data
 * @param pageSize
 * @param pageNum
 * @returns
 */
export function Paginate(data: { list: Array<any>; pageSize: number; pageNum: number }, filterParam: any) {
  // 检查 pageSize 和 pageNumber 的合法性
  if (data.pageSize <= 0 || data.pageNum < 0) {
    return [];
  }

  // 将数据转换为数组
  let arrayData = Lodash.toArray(data.list);

  if (Object.keys(filterParam).length > 0) {
    arrayData = Lodash.filter(arrayData, item => {
      const arr = [];
      if (filterParam.ipaddr) {
        arr.push(Boolean(item.ipaddr.includes(filterParam.ipaddr)));
      }

      if (filterParam.userName && item.userName) {
        arr.push(Boolean(item.userName.includes(filterParam.userName)));
      }
      return !arr.includes(false);
    });
  }

  // 获取指定页的数据
  const pageData = arrayData.slice((data.pageNum - 1) * data.pageSize, data.pageNum * data.pageSize);

  return pageData;
}

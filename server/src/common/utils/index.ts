import * as Lodash from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import * as dayjs from 'dayjs';
// import isLeapYear from 'dayjs/plugin/isLeapYear'; // 导入插件
// import timezone from 'dayjs/plugin/timezone'; // 导入插件
// import utc from 'dayjs/plugin/utc'; // 导入插件
import 'dayjs/locale/zh-cn'; // 导入本地化语言
// dayjs.extend(utc);
// dayjs.extend(timezone);
// dayjs.extend(isLeapYear); // 使用插件
// dayjs.locale('zh-cn'); // 使用本地化语言
// dayjs.tz.setDefault('Asia/Beijing');

/**
 * 获取当前时间
 * YYYY-MM-DD HH:mm:ss
 * @returns
 */
export function GetNowDate() {
  return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

/**
 * 时间格式化
 * @param date
 * @param format
 * @returns
 */
export function FormatDate(date: Date, format = 'YYYY-MM-DD HH:mm:ss') {
  return date && dayjs(date).format(format);
}

/**
 * 深拷贝
 * @param obj
 * @returns
 */
export function DeepClone(obj: object) {
  return Lodash.cloneDeep(obj);
}

/**
 * 生成唯一id
 * UUID
 * @returns
 */
export function GenerateUUID(): string {
  const uuid = uuidv4();
  return uuid.replaceAll('-', '');
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
    arrayData = Lodash.filter(arrayData, (item) => {
      const arr = [];
      if (filterParam.ipaddr) {
        arr.push(Boolean(item.ipaddr.includes(filterParam.ipaddr)));
      }

      if (filterParam.userName && item.username) {
        arr.push(Boolean(item.username.includes(filterParam.userName)));
      }
      return !Boolean(arr.includes(false));
    });
  }

  // 获取指定页的数据
  const pageData = arrayData.slice((data.pageNum - 1) * data.pageSize, data.pageNum * data.pageSize);

  return pageData;
}

/**
 * @description: 提取url ?后参数
 * @param {*} url
 */
export function getParams(url: string) {
  const regex = /[?&]+([^=&]+)=([^&]*)/gi;
  const params = {};
  url.replace(regex, function (_, key, value) {
    params[key] = decodeURIComponent(value);
    return params[key];
  });
  return params;
}

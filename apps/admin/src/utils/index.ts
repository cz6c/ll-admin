import { isArray, isNumber } from "@llcz/common";

/**
 * @description 处理值无数据情况
 * @param {*} callValue 需要处理的值
 * @returns {String}
 * */
export function formatValue(callValue: any): string {
  // 如果当前值为数组，使用 / 拼接（根据需求自定义）
  if (isArray(callValue)) return callValue.length ? callValue.join(" / ") : "--";
  return callValue ?? "--";
}

/**
 * @description 处理 prop 为多级嵌套的情况，返回的数据 (列如: prop: user.name)
 * @param {Object} row 当前行数据
 * @param {String} prop 当前 prop
 * @returns {*}
 * */
export function handleRowAccordingToProp(row: { [key: string]: any }, prop: string): any {
  if (!prop.includes(".")) return row[prop] ?? "--";
  prop.split(".").forEach(item => (row = row[item] ?? "--"));
  return row;
}

/**
 * @description 处理 prop，当 prop 为多级嵌套时 ==> 返回最后一级 prop
 * @param {String} prop 当前 prop
 * @returns {String}
 * */
export function handleProp(prop: string): string {
  const propArr = prop.split(".");
  if (propArr.length == 1) return prop;
  return propArr[propArr.length - 1];
}

/**
 * @description: 打开新窗口
 */
export function openWindow(
  url: string,
  opt?: {
    target?: TargetContext | string;
    noopener?: boolean;
    noreferrer?: boolean;
  }
) {
  const { target = "__blank", noopener = true, noreferrer = true } = opt || {};
  const feature: string[] = [];

  noopener && feature.push("noopener=yes");
  noreferrer && feature.push("noreferrer=yes");

  window.open(url, target, feature.join(","));
}

/**
 * @description: enum数据转opts
 * @param data
 */
export function enumToOpts(data: unknown) {
  return Object.entries(data)
    .filter(([, value]) => isNumber(value))
    .map(([label, value]) => ({ value, label }));
}

/**
 * @description: 日期范围处理
 */
export function addDateRange(params, dateRange) {
  const search = params;
  dateRange = Array.isArray(dateRange) ? dateRange : [];
  search["beginTime"] = dateRange[0];
  search["endTime"] = dateRange[1];
  return search;
}

/**
 * @description: 字符串格式化(%s )
 * 可能的用例：sprintf("Hello, %s!", "World") → "Hello, World!"
 * @param {*} str
 * @return {*} str
 */
export function sprintf(str: string): string {
  // eslint-disable-next-line prefer-rest-params
  const args = [...arguments];

  if (args.length < (str.match(/%s/g) || []).length) {
    console.warn("参数数量不足");
    return "";
  }

  return str.replace(/%s/g, () => {
    const arg = args.shift();
    return arg !== undefined ? arg : "";
  });
}

/**
 * @description: 递归合并数据
 * @param {*} source
 * @param {*} target
 */
export function mergeRecursive(source, target) {
  for (const p in target) {
    try {
      if (target[p].constructor == Object) {
        source[p] = mergeRecursive(source[p], target[p]);
      } else {
        source[p] = target[p];
      }
    } catch (error) {
      source[p] = target[p];
    }
  }
  return source;
}

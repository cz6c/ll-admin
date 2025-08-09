import { isNumber } from "@llcz/common";

/**
 * @description: 根据对象的引用获取值
 * @param {any} target
 * @param {string} refer
 * @return {*}
 */
export function getValueByReference(target: any, refer: string | string[]): any {
  const refers: string[] = typeof refer === "string" ? (refer as string).split(".") : (refer as string[]);
  return refers.reduce((obj, key) => {
    return obj && obj[key];
  }, target);
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

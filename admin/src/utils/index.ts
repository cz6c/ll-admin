import { isArray, isNumber } from "@/utils/is";

/**
 * @description 生成唯一 uuid
 * @returns {String}
 */
export function generateUUID() {
  let uuid = "";
  for (let i = 0; i < 32; i++) {
    const random = (Math.random() * 16) | 0;
    if (i === 8 || i === 12 || i === 16 || i === 20) uuid += "-";
    uuid += (i === 12 ? 4 : i === 16 ? (random & 3) | 8 : random).toString(16);
  }
  return uuid;
}

/**
 * @description 生成随机数
 * @param {Number} min 最小值
 * @param {Number} max 最大值
 * @returns {Number}
 */
export function randomNum(min: number, max: number): number {
  const num = Math.floor(Math.random() * (min - max) + max);
  return num;
}

/**
 * @description 获取当前时间对应的提示语
 * @returns {String}
 */
export function getTimeState(): string {
  const timeNow = new Date();
  const hours = timeNow.getHours();
  if (hours >= 6 && hours <= 10) return `早上好 ⛅`;
  if (hours >= 10 && hours <= 14) return `中午好 🌞`;
  if (hours >= 14 && hours <= 18) return `下午好 🌞`;
  if (hours >= 18 && hours <= 24) return `晚上好 🌛`;
  if (hours >= 0 && hours <= 6) return `凌晨好 🌛`;
  return "";
}

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

// 日期格式化
export function parseTime(time, pattern = "{y}-{m}-{d} {h}:{i}:{s}") {
  if (arguments.length === 0 || !time) {
    return null;
  }
  const format = pattern;
  let date;
  if (typeof time === "object") {
    date = time;
  } else {
    if (typeof time === "string" && /^[0-9]+$/.test(time)) {
      time = parseInt(time);
    } else if (typeof time === "string") {
      time = time
        .replace(new RegExp(/-/gm), "/")
        .replace("T", " ")
        .replace(new RegExp(/\.[\d]{3}/gm), "");
    }
    if (typeof time === "number" && time.toString().length === 10) {
      time = time * 1000;
    }
    date = new Date(time);
  }
  const formatObj = {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
    h: date.getHours(),
    i: date.getMinutes(),
    s: date.getSeconds(),
    a: date.getDay()
  };
  const time_str = format.replace(/{(y|m|d|h|i|s|a)+}/g, (result, key) => {
    let value = formatObj[key];
    // Note: getDay() returns 0 on Sunday
    if (key === "a") {
      return ["日", "一", "二", "三", "四", "五", "六"][value];
    }
    if (result.length > 0 && value < 10) {
      value = "0" + value;
    }
    return value || 0;
  });
  return time_str;
}

/**
 * @description: 日期范围处理
 */
export function addDateRange(params, dateRange) {
  let search = params;
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
  for (var p in target) {
    try {
      if (target[p].constructor == Object) {
        source[p] = mergeRecursive(source[p], target[p]);
      } else {
        source[p] = target[p];
      }
    } catch (e) {
      source[p] = target[p];
    }
  }
  return source;
}

/**
 * @description: get请求参数处理
 * @param {Record} params
 * @return {*} string
 */
export function tansParams(params: Record<string, any>): string {
  let result = "";
  for (const propName of Object.keys(params)) {
    const value = params[propName];
    var part = encodeURIComponent(propName) + "=";
    if (value !== null && value !== "" && typeof value !== "undefined") {
      if (typeof value === "object") {
        for (const key of Object.keys(value)) {
          if (value[key] !== null && value[key] !== "" && typeof value[key] !== "undefined") {
            let params = propName + "[" + key + "]";
            var subPart = encodeURIComponent(params) + "=";
            result += subPart + encodeURIComponent(value[key]) + "&";
          }
        }
      } else {
        result += part + encodeURIComponent(value) + "&";
      }
    }
  }
  return result.slice(0, -1);
}

/**
 * @description: 提取url ?后参数
 * @param {*} url
 */
export function getQueryParams(url: string) {
  const regex = /[?&]+([^=&]+)=([^&]*)/gi;
  const params = {};
  url.replace(regex, function (_, key, value) {
    params[key] = decodeURIComponent(value);
    return params[key];
  });
  return params;
}

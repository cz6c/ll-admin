export function is(val: unknown, type: string) {
  return Object.prototype.toString.call(val) === `[object ${type}]`;
}

/**
 * @description: 验证Number
 * @param {unknown} val
 * @return {*}
 */
export function isNumber(val: unknown): val is number {
  return is(val, "Number");
}

/**
 * @description: 验证String
 * @param {unknown} val
 * @return {*}
 */
export function isString(val: unknown): val is string {
  return is(val, "String");
}

/**
 * @description: 验证Boolean
 * @param {unknown} val
 * @return {*}
 */
export function isBoolean(val: unknown): val is boolean {
  return is(val, "Boolean");
}

/**
 * @description: 验证日期对象
 * @param {unknown} val
 * @return {*}
 */
export function isDate(val: unknown): val is Date {
  return is(val, "Date");
}

/**
 * @description: 验证RegExp
 * @param {unknown} val
 * @return {*}
 */
export function isRegExp(val: unknown): val is RegExp {
  return is(val, "RegExp");
}

/**
 * @description: 验证函数
 * @param {unknown} val
 * @return {*}
 */
export function isFunction(val: unknown): val is Function {
  return typeof val === "function";
}

/**
 * @description: 验证undefined
 * @param {unknown} val
 * @return {*}
 */
export function isDef<T = unknown>(val?: T): val is T {
  return typeof val === "undefined";
}

/**
 * @description: 验证null
 * @param {unknown} val
 * @return {*}
 */
export function isNull(val: unknown): val is null {
  return val === null;
}

/**
 * @description: 验证数组
 * @param {any} val
 * @return {*}
 */
export function isArray(val: any): val is Array<any> {
  return val && Array.isArray(val);
}

/**
 * @description: 验证对象
 * @param {any} val
 * @return {*}
 */
export function isObject(val: any): val is Record<any, any> {
  return val !== null && is(val, "Object");
}

/**
 * @description: 验证数组、对象、map、set是否为空
 * @param {T} val
 * @return {*}
 */
export function isEmpty<T = unknown>(val: T): val is T {
  if (isArray(val) || isString(val)) {
    return val.length === 0;
  }

  if (val instanceof Map || val instanceof Set) {
    return val.size === 0;
  }

  if (isObject(val)) {
    return Object.keys(val).length === 0;
  }

  return false;
}

/**
 * @description: 验证Promise
 * @param {unknown} val
 * @return {*}
 */
export function isPromise<T = any>(val: unknown): val is Promise<T> {
  return is(val, "Promise") && isObject(val) && isFunction(val.then) && isFunction(val.catch);
}

/**
 * @description: 验证Window
 * @param {any} val
 * @return {*}
 */
export function isWindow(val: any): val is Window {
  return typeof window !== "undefined" && is(val, "Window");
}

/**
 * @description: 验证dom元素
 * @param {unknown} val
 * @return {*}
 */
export function isElement(val: unknown): val is Element {
  return isObject(val) && !!val.tagName;
}

/**
 * @description: 验证链接 https://  http://
 * @param {string} url
 * @return {*}
 */
export function isHttp(url: string): boolean {
  const reg = /^http(s)?:\/\//;
  return reg.test(url);
}

/**
 * @description: 验证链接
 * @param {string} path
 * @return {*}
 */
export function isExternal(path: string): boolean {
  return /^(https?:|mailto:|tel:)/.test(path);
}

/**
 * @description: 验证邮箱
 * @param {string} email
 * @return {*}
 */
export function isEmail(email: string): boolean {
  const reg =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return reg.test(email);
}

import { isDef, isNull, isObject } from "./is";

/**
 * @description: 提取url ?后参数
 * @param url 链接
 * @returns query对象
 */
export function queryParse(url: string) {
  const regex = /[?&]+([^=&]+)=([^&]*)/gi;
  const params = {} as any;
  url.replace(regex, function (_, key, value) {
    params[key] = decodeURIComponent(value);
    return params[key];
  });
  return params;
}

/**
 * 将对象序列化为URL查询字符串，用于替代第三方的 qs 库，节省宝贵的体积
 * 支持基本类型值和数组，嵌套对象
 * @param obj 要序列化的对象
 * @returns 序列化后的查询字符串
 */
export function queryStringify(obj: Record<string, any>): string {
  if (!isObject(obj)) return "";

  return Object.entries(obj)
    .filter(([_, value]) => !isDef(value) && !isNull(value))
    .map(([key, value]) => {
      // 对键进行编码
      const encodedKey = encodeURIComponent(key);

      // 处理数组类型
      if (Array.isArray(value)) {
        return value
          .filter(v => !isDef(v) && !isNull(v))
          .map(item => `${encodedKey}=${encodeURIComponent(item)}`)
          .join("&");
      }

      // 处理对象类型
      if (isObject(value)) {
        return Object.entries(value)
          .filter(([_, v]) => !isDef(v) && !isNull(v))
          .map(([k, v]) => `encodedKey[${encodeURIComponent(k)}]=${encodeURIComponent(v)}`)
          .join("&");
      }

      // 处理基本类型
      return `${encodedKey}=${encodeURIComponent(value)}`;
    })
    .join("&");
}

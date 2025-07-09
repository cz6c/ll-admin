import { v4 as uuidv4 } from "uuid";

/**
 * 生成唯一id
 * UUID
 * @returns
 */
export function generateUUID(): string {
  const uuid = uuidv4();
  return uuid.replaceAll("-", "");
}

/**
 * @description 生成随机数
 * @param {Number} min 最小值
 * @param {Number} max 最大值
 * @returns {Number}
 */
export function generateRandomNum(min: number, max: number): number {
  const num = Math.floor(Math.random() * (min - max) + max);
  return num;
}

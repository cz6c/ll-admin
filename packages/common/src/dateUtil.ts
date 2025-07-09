import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import "dayjs/locale/zh-cn";

dayjs.extend(utc); // 增加了 .utc .local .isUTC APIs 使用 UTC 模式来解析和展示时间。2019-03-06T09:11:55Z

dayjs.locale("zh-cn");

/** 时间工具 */
export const dateUtil = dayjs;

export const DATETIME_FORMAT = "YYYY-MM-DD HH:mm:ss";
export const DATE_FORMAT = "YYYY-MM-DD";
export const TIME_FORMAT = "HH:mm";

/**
 * 格式化日期
 * @param _date 日期对象、时间戳或字符串
 * @param format 格式字符串
 * @returns 格式化后的日期字符串
 */
function _format(_date: dayjs.ConfigType, format: string): string {
  if (!_date) {
    return _date as any;
  }
  const date = dateUtil(_date);
  return date.isValid() ? date.format(format) : (_date as string);
}
/**
 * 格式化为日期时间字符串
 * @param date 日期对象、时间戳或字符串，默认为当前
 * @returns 格式化后的日期时间字符串 YYYY-MM-DD HH:mm:ss
 */
export function formatToDatetime(date: dayjs.ConfigType = dateUtil()): string {
  return _format(date, DATETIME_FORMAT);
}

/**
 * 格式化为日期字符串
 * @param date 日期对象、时间戳或字符串，默认为当前
 * @returns 格式化后的日期字符串 YYYY-MM-DD
 */
export function formatToDate(date: dayjs.ConfigType = dateUtil()): string {
  return _format(date, DATE_FORMAT);
}

/**
 * 格式化为日期字符串
 * @param date 日期对象、时间戳或字符串，默认为当前
 * @returns 格式化后的日期字符串 HH:mm
 */
export function formatToTime(date: dayjs.ConfigType = dateUtil()): string {
  return _format(date, TIME_FORMAT);
}

/**
 * 时间人性化显示
 * @param date 要格式化的日期
 * @returns 人性化的时间字符串
 */
export function humanizedDate(date: dayjs.ConfigType): string {
  if (!date || !dateUtil(date).isValid()) {
    return "";
  }

  const now = dateUtil();
  const diffSeconds = now.diff(date, "second");
  const diffMinutes = now.diff(date, "minute");
  const diffHours = now.diff(date, "hour");
  const diffDays = now.diff(date, "day");

  if (diffSeconds < 60) {
    return `${diffSeconds}秒前`;
  } else if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return formatToDatetime(date);
  }
}

/**
 * 获取时辰问候语
 * @returns 根据当前时间返回相应的问候语
 */
export function getGreeting(): string {
  const currentHour = dateUtil().hour();
  if (currentHour >= 5 && currentHour < 12) {
    return "早上好";
  } else if (currentHour >= 12 && currentHour < 14) {
    return "中午好";
  } else if (currentHour >= 14 && currentHour < 18) {
    return "下午好";
  } else if (currentHour >= 18 && currentHour < 24) {
    return "晚上好";
  } else {
    return "深夜了";
  }
}

/**
 * @description: 使用 UTC 模式来解析和展示时间。2019-03-06T09:11:55Z
 * @param {dayjs} _date 要格式化的日期
 * @return {*}
 */
export function formatUtc(_date: dayjs.ConfigType): dayjs.Dayjs {
  if (!_date) {
    return _date as any;
  }
  const date = dateUtil(_date);
  return date.isValid() ? date.utc() : null;
}

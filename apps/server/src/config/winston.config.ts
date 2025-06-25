import { WinstonModuleOptions } from 'nest-winston';
import { format, transports } from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

export const winstonConfig = (): WinstonModuleOptions => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    level: isProd ? 'info' : 'debug',
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), // 精确到毫秒
      format.errors({ stack: true }), // 记录错误堆栈
      format.json(), // 结构化 JSON 输出
    ),
    transports: isProd
      ? [
          // 日志文件
          new DailyRotateFile({
            filename: 'logs/errors/error-%DATE%.log', // 日志名称，占位符 %DATE% 取值为 datePattern 值。
            datePattern: 'YYYY-MM-DD', // 日志轮换的频率，此处表示每天。
            zippedArchive: true, // 是否通过压缩的方式归档被轮换的日志文件。
            maxSize: '20m', // 设置日志文件的最大大小，m 表示 mb 。
            maxFiles: '14d', // 保留日志文件的最大天数，此处表示自动删除超过 14 天的日志文件。
            level: 'error', // 日志类型，此处表示只记录错误日志。
          }),
          new DailyRotateFile({
            filename: 'logs/warnings/warning-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            level: 'warn',
          }),
          new DailyRotateFile({
            filename: 'logs/app/app-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
          }),
        ]
      : [
          // 控制台
          new transports.Console({
            level: 'debug',
            format: format.combine(
              format.colorize(),
              format.printf(({ timestamp, level, message, context }) => {
                return `${timestamp}  ${level}:  [${context || 'App'}]  ${message}`;
              }),
            ),
          }),
        ],
  };
};

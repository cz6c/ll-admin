import type { WinstonModuleOptions } from "nest-winston";
import { format, transports } from "winston";
import * as DailyRotateFile from "winston-daily-rotate-file";

const rotateDefaults = {
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d"
};

/** 仅写入指定 level，避免 error/warn/info 重复落盘到多个文件 */
function levelOnly(targetLevel: string) {
  return format(info => (info.level === targetLevel ? info : false))();
}

function createLevelFileTransport(filename: string, level: string) {
  return new DailyRotateFile({
    ...rotateDefaults,
    filename,
    level,
    format: format.combine(
      levelOnly(level),
      format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
      format.errors({ stack: true }),
      format.json()
    )
  });
}

const fileTransports = [
  createLevelFileTransport("logs/errors/error-%DATE%.log", "error"),
  createLevelFileTransport("logs/warnings/warning-%DATE%.log", "warn"),
  createLevelFileTransport("logs/info/info-%DATE%.log", "info"),
  createLevelFileTransport("logs/debug/debug-%DATE%.log", "debug")
];

export const winstonConfig = (): WinstonModuleOptions => {
  const isProd = process.env.NODE_ENV === "production";

  return {
    level: isProd ? "info" : "debug",
    format: format.combine(
      format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
      format.errors({ stack: true }),
      format.json()
    ),
    transports: isProd
      ? fileTransports
      : [
          ...fileTransports,
          new transports.Console({
            level: "debug",
            format: format.combine(
              format.colorize(),
              format.printf(({ timestamp, level, message, context }: { timestamp: string; level: string; message: string; context: string }) => {
                return `${timestamp}  ${level}:  [${context || "App"}]  ${message}`;
              })
            )
          })
        ]
  };
};

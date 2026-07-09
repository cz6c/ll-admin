import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { FileLogger, type LoggerOptions } from "typeorm";
import { ensureRuntimeDirs, getOrmLogPath } from "./runtime-paths";

class ServerFileLogger extends FileLogger {
  write(strings: string | string[]) {
    const payload = (Array.isArray(strings) ? strings : [strings])
      .map((str) => `[${new Date().toISOString()}]${str}`)
      .join("\r\n");
    const logPath = getOrmLogPath();
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${payload}\r\n`);
  }
}

export function createServerOrmLogger(logging: LoggerOptions = "all") {
  ensureRuntimeDirs();
  return new ServerFileLogger(logging);
}

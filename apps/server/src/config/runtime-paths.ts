import { mkdirSync } from "node:fs";
import { join } from "node:path";

const isProd = process.env.NODE_ENV === "production";

/** 运行时数据根目录：生产外置 ../data，开发落在 server 包内 */
export function getRuntimeDataDir(): string {
  return isProd ? join(process.cwd(), "..", "data") : process.cwd();
}

export function getAppLogDir(): string {
  return isProd ? join(getRuntimeDataDir(), "logs") : join(process.cwd(), "logs");
}

export function getOrmLogPath(): string {
  return isProd ? join(getRuntimeDataDir(), "ormlogs.log") : join(process.cwd(), "ormlogs.log");
}

/** 确保日志目录存在（Winston 分级子目录 + PM2 输出目录） */
export function ensureRuntimeDirs(): void {
  const logDir = getAppLogDir();
  for (const sub of ["errors", "warnings", "info", "debug"]) {
    mkdirSync(join(logDir, sub), { recursive: true });
  }
}

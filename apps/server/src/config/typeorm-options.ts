import type { DataSourceOptions } from "typeorm";
import { createServerOrmLogger } from "./typeorm-logger";

type MysqlConfig = Record<string, unknown> & {
  logging?: DataSourceOptions["logging"];
  logger?: string;
};

export function buildMysqlTypeOrmOptions(
  mysql: MysqlConfig,
  extra: Record<string, unknown> = {}
): DataSourceOptions {
  const { logger: loggerConfig, logging, ...rest } = mysql;

  let logger: DataSourceOptions["logger"];
  if (logging && loggerConfig === "file") {
    logger = createServerOrmLogger(logging === true ? "all" : logging);
  } else if (loggerConfig) {
    logger = loggerConfig as DataSourceOptions["logger"];
  }

  return {
    type: "mysql",
    ...rest,
    ...(logging !== undefined ? { logging } : {}),
    ...(logger !== undefined ? { logger } : {}),
    ...extra
  } as DataSourceOptions;
}

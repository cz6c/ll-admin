import { createLogger, type Logger } from "vite";

/** 代理目标未启动时的 ECONNREFUSED（含 Node AggregateError） */
function isProxyConnRefused(msg: string, options?: { error?: unknown }): boolean {
  if (!msg.includes("http proxy error")) return false;
  const err = options?.error;
  if (!err || typeof err !== "object") return false;
  if ("code" in err && (err as NodeJS.ErrnoException).code === "ECONNREFUSED") return true;
  if (err instanceof AggregateError) {
    return err.errors.some(e => typeof e === "object" && e !== null && "code" in e && (e as NodeJS.ErrnoException).code === "ECONNREFUSED");
  }
  return false;
}

/**
 * CS/Tauri 本地 dev：Nest 常未启动，过滤 Vite 代理 ECONNREFUSED 终端刷屏。
 * 代理仍返回 502 JSON（见 createProxy），此处仅静音 logger.error。
 */
export function createCsDevLogger(): Logger {
  const logger = createLogger(undefined, { prefix: "[vite]" });
  const baseError = logger.error.bind(logger);
  logger.error = (msg, options) => {
    if (typeof msg === "string" && isProxyConnRefused(msg, options)) return;
    baseError(msg, options);
  };
  return logger;
}

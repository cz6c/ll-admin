import type { ProxyOptions } from "vite";

type ProxyItem = [string, string];

type ProxyList = ProxyItem[];

type ProxyTargetList = Record<string, ProxyOptions>;

/** 代理目标未启动时的 ECONNREFUSED（含 Node AggregateError） */
function isConnRefused(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ECONNREFUSED") {
    return true;
  }
  if (err instanceof AggregateError) {
    return err.errors.some(e => isConnRefused(e));
  }
  return false;
}

/**
 * 创建代理，用于解析 .env.development 代理配置
 * @param list
 */
export function createProxy(list: ProxyList = []) {
  const ret: ProxyTargetList = {};
  for (const [prefix, target] of list) {
    const httpsRE = /^https:\/\//;
    const isHttps = httpsRE.test(target);

    // https://github.com/http-party/node-http-proxy#options
    ret[prefix] = {
      target: target,
      changeOrigin: true,
      ws: true,
      rewrite: path => path.replace(new RegExp(`^${prefix}`), ""),
      // https is require secure=false
      ...(isHttps ? { secure: false } : {}),
      // CS 本地仅跑 admin 时 Nest 常未启动；吞掉 ECONNREFUSED，避免终端刷 proxy error
      configure: proxy => {
        proxy.on("error", (err, _req, res) => {
          if (isConnRefused(err) && res && "writeHead" in res && !res.headersSent) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ code: 502, msg: "API 服务未启动" }));
            return;
          }
          console.warn("[vite proxy]", err instanceof Error ? err.message : err);
        });
      }
    };
  }
  return ret;
}

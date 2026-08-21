import type { ProxyOptions } from "vite";

type ProxyItem = [string, string];

type ProxyList = ProxyItem[];

type ProxyTargetList = Record<string, ProxyOptions>;

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
          const refused = "code" in err && err.code === "ECONNREFUSED";
          if (refused && res && "writeHead" in res && !res.headersSent) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ code: 502, msg: "API 服务未启动" }));
            return;
          }
          console.warn("[vite proxy]", err.message);
        });
      }
    };
  }
  return ret;
}

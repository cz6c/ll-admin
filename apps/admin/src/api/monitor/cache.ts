import $http from "@/utils/request";
import type { CacheData, CacheInfo } from "#/api/monitor/cache";

// 查询缓存详细
export function getCache() {
  return $http.request<never, CacheInfo>({
    url: "/monitor/cache",
    method: "get"
  });
}

// 查询缓存名称列表
export function listCacheName() {
  return $http.request<never, CacheData[]>({
    url: "/monitor/cache/getNames",
    method: "get"
  });
}

// 查询缓存键名列表
export function listCacheKey(cacheName: string) {
  return $http.request<never, string[]>({
    url: "/monitor/cache/getKeys/" + cacheName,
    method: "get"
  });
}

// 查询缓存内容
export function getCacheValue(cacheName: string, cacheKey: string) {
  return $http.request<never, CacheData>({
    url: "/monitor/cache/getValue/" + cacheName + "/" + cacheKey,
    method: "get"
  });
}

// 清理指定名称缓存
export function clearCacheName(cacheName: string) {
  return $http.request({
    url: "/monitor/cache/clearCacheName/" + cacheName,
    method: "get"
  });
}

// 清理指定键名缓存
export function clearCacheKey(cacheKey: string) {
  return $http.request({
    url: "/monitor/cache/clearCacheKey/" + cacheKey,
    method: "get"
  });
}

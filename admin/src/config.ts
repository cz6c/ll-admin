interface ProductConfig {
  isDynamicAddedRoute: boolean;
  openKeepAlive: boolean;
}

export const productConfig: ProductConfig = {
  // 是否启用动态路由
  isDynamicAddedRoute: true,
  // 是否启用多标签页缓存
  openKeepAlive: false,
};

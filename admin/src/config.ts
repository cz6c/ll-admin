interface ProductConfig {
  isDynamicAddedRoute: boolean;
  isPermCode: boolean;
  openKeepAlive: boolean;
}

export const productConfig: ProductConfig = {
  // 是否启用动态路由
  isDynamicAddedRoute: false,
  // 是否启用按钮权限控制
  isPermCode: false,
  // 是否启用多标签页缓存
  openKeepAlive: false,
};

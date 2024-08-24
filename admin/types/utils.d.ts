import type { ComputedRef, Ref } from "vue";
import type { RouteMeta, RouteRecordName } from "vue-router";

export type DynamicProps<T> = {
  [P in keyof T]: Ref<T[P]> | T[P] | ComputedRef<T[P]>;
};

export interface AppRouteMeta extends RouteMeta {
  // 菜单名称
  title: string;
  // 菜单图标
  icon?: string;
  // 当路由设置了该属性，则会高亮相对应的侧边栏
  activeMenu?: string;
  // 如果设置为false，则不会在breadcrumb面包屑中显示
  breadcrumb?: boolean;
  // 标签页固定
  affix?: boolean;
  // 是否忽略KeepAlive缓存
  noCache?: boolean;
  // 是否外链
  link?: string;
  // 页面功能权限
  perms?: string[];
}

export interface AppRouteRecordRaw {
  // 路由地址
  path: string;
  // 路由名字（必须保持唯一）
  name: RouteRecordName;
  // 是否隐藏该菜单
  hidden?: boolean;
  // 路由元信息
  meta?: AppRouteMeta;
  // 路由重定向  当设置 noRedirect 的时候该路由在面包屑导航中不可被点击
  redirect?: string;
  // 按需加载需要展示的页面
  component?: Component | string;
  // 子路由配置项
  children?: AppRouteRecordRaw[];
}

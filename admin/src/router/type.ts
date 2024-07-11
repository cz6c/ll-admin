import type { RouteMeta, RouteRecordName } from "vue-router";
import { defineComponent } from "vue";

export type Component<T = any> =
  | ReturnType<typeof defineComponent>
  | (() => Promise<typeof import("*.vue")>)
  | (() => Promise<T>);

export interface AppRouteMeta extends RouteMeta {
  // 菜单名称
  title: string;
  // 菜单图标
  icon?: string;
  // 是否隐藏该菜单
  hideMenu?: boolean;
  // 当前激活的菜单。用于配置hideMenu true时左侧激活的菜单路径
  activeMenu?: string;
  // 是否隐藏该路由在面包屑上面的显示
  hideBreadcrumb?: boolean;
  // 菜单排序
  orderNo?: number;
  // 需要内嵌的iframe链接地址
  frameSrc?: string;
  // 标签页固定
  affix?: boolean;
  // 当前菜单名称或自定义信息禁止添加到标签页
  hideTag?: boolean;
  // 显示在标签页的最大数量
  dynamicLevel?: number;
  // 是否忽略KeepAlive缓存
  ignoreKeepAlive?: boolean;
}

export interface AppRouteRecordRaw {
  // 路由地址
  path: string;
  // 路由名字（必须保持唯一）
  name: RouteRecordName;
  // 路由元信息
  meta: AppRouteMeta;
  // 路由重定向
  redirect?: string;
  // 按需加载需要展示的页面
  component?: Component | string;
  // 子路由配置项
  children?: AppRouteRecordRaw[];
}

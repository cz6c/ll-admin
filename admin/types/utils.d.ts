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
}

export interface AppRouteRecordRaw {
  // 路由地址
  path: string;
  // 路由名字（必须保持唯一）
  name: RouteRecordName;
  // 当你一个路由下面的 children 声明的路由大于1个时，自动会变成嵌套的模式--如组件页面
  // 只有一个时，会将那个子路由当做根路由显示在侧边栏--如引导页面
  // 若你想不管路由下面的 children 声明的个数都显示你的根路由
  // 你可以设置 alwaysShow: true，这样它就会忽略之前定义的规则，一直显示根路由
  alwaysShow?: boolean;
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

import type { BaseResponse } from "#/api/index.d";

export type SysMenuData = {
  // 菜单ID
  menuId: number;
  // 菜单名称
  menuName: string;
  // 父菜单ID
  parentId: number;
  // 显示顺序
  orderNum: number;
  // 路由地址
  path: string;
  // 组件路径
  component: string;
  // 组件name
  name: string;
  // 高亮菜单
  activeMenu: string;
  //是否为外链（0是 1否）
  isFrame: string;
  //是否缓存（0是 1否）
  isCache: string;
  //是否显示（0是 1否）
  visible: string;
  // 菜单图标
  icon: string;
  // 功能权限标识
  perm: string;
  //菜单类型（M菜单 F按钮）
  menuType: string;
};

export type SysMenuResponse = Required<SysMenuData> & BaseResponse;

export type SysMenuListParams = {
  menuName?: string;
  status?: string;
  parentId?: number;
};

export type SysMenuListResponse = SysMenuResponse[];

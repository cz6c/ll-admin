import type { BaseResponse } from "#/api/index.d";

export type UpdateMenuDto = {
  menuId: number;
  menuName: string;
  parentId: number;
  orderNum: number;
  path: string;
  component: string;
  name: string;
  activeMenu: string;
  isCache: string;
  isFrame: string;
  perm: string;
  menuType: string;
  status: string;
  visible: string;
  icon?: string;
};

export type SysMenuListParams = {
  menuName?: string;
  status?: string;
  parentId?: number;
};

export type SysMenuVo = Required<UpdateMenuDto> & BaseResponse;

export type MenuTreeVo = SysMenuVo & {
  children: MenuTreeVo[];
};

export type RoleMenuTreeSelect = {
  menus: MenuTreeVo[];
  checkedIds: number[];
};

import { $http } from "@/utils/request";
import type { SysMenuResponse, SysMenuListParams, SysMenuListResponse, SysMenuData } from "#/api/system/menu";

// 查询菜单列表
export function getMenuList(params?: SysMenuListParams) {
  return $http<never, SysMenuListResponse>({
    url: `/system/menu/list`,
    method: "get",
    params
  });
}

// 查询菜单详细
export function getMenuDetail(menuId: number) {
  return $http<never, SysMenuResponse>({
    url: `/system/menu/${menuId}`,
    method: "get"
  });
}

// 查询菜单下拉树结构
export function treeselect() {
  return $http<never, SysMenuListResponse>({
    url: `/system/menu/treeselect`,
    method: "get"
  });
}

// 根据角色ID查询菜单下拉树结构
export function roleMenuTreeselect(roleId: number) {
  return $http<never, { menus: SysMenuListResponse; checkedKeys: number[] }>({
    url: `/system/menu/roleMenuTreeselect/${roleId}`,
    method: "get"
  });
}

// 新增菜单
export function addMenu(data: SysMenuData) {
  return $http<SysMenuData, never>({
    url: `/system/menu`,
    method: "post",
    data: data
  });
}

// 修改菜单
export function updateMenu(data: SysMenuData) {
  return $http<SysMenuData, never>({
    url: `/system/menu`,
    method: "put",
    data: data
  });
}

// 删除菜单
export function delMenu(menuId: number) {
  return $http({
    url: `/system/menu/${menuId}`,
    method: "delete"
  });
}

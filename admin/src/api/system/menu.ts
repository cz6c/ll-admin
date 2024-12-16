import { $http } from "@/utils/request";
import type { SysMenuListParams, UpdateMenuDto, SysMenuVo, MenuTreeVo, RoleMenuTreeSelect } from "#/api/system/menu";

// 查询菜单列表
export function getMenuList(params?: SysMenuListParams) {
  return $http<never, SysMenuVo[]>({
    url: `/system/menu/list`,
    method: "get",
    params
  });
}

// 查询菜单详细
export function getMenuDetail(menuId: number) {
  return $http<never, SysMenuVo>({
    url: `/system/menu/${menuId}`,
    method: "get"
  });
}

// 查询菜单下拉树结构
export function menuTreeSelect() {
  return $http<never, MenuTreeVo[]>({
    url: `/system/menu/treeSelect`,
    method: "get"
  });
}

// 根据角色ID查询菜单下拉树结构
export function roleMenuTreeSelect(roleId: number) {
  return $http<never, RoleMenuTreeSelect>({
    url: `/system/menu/roleMenuTreeSelect/${roleId}`,
    method: "get"
  });
}

// 新增菜单
export function addMenu(data: UpdateMenuDto) {
  return $http<UpdateMenuDto, never>({
    url: `/system/menu/create`,
    method: "post",
    data: data
  });
}

// 修改菜单
export function updateMenu(data: UpdateMenuDto) {
  return $http<UpdateMenuDto, never>({
    url: `/system/menu/update`,
    method: "post",
    data: data
  });
}

// 删除菜单
export function delMenu(menuId: number) {
  return $http({
    url: `/system/menu/delete/${menuId}`,
    method: "get"
  });
}

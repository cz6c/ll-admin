import { $http } from "@/utils/request";
import type { LoginParams, SysDictResponse } from "#/api";
import type { AppRouteRecordRaw } from "#/utils";
import type { UserVo } from "#/api/system/user.d";

// 登录
export function login(data: LoginParams) {
  return $http<LoginParams, { token: string }>({
    url: "/login",
    method: "post",
    data
  });
}
// 注册
export function register(data: LoginParams) {
  return $http<LoginParams, never>({
    url: "/register",
    method: "post",
    data
  });
}
// 获取验证图片
export function getCodeImg(params: { uuid: string }) {
  return $http<never, { captchaEnabled: boolean; img: string; uuid: string }>({
    url: "/captchaImage",
    method: "get",
    params
  });
}
// 获取当前用户信息
export function getLoginUserInfo() {
  return $http<never, UserVo>({
    url: "/getLoginUserInfo",
    method: "get"
  });
}
// 获取当前用户菜单
export function getRouters() {
  return $http<never, AppRouteRecordRaw[]>({
    url: "/getRouters",
    method: "get"
  });
}

// 获取城市地区
export function getAreaList() {
  return $http<never, any>({
    url: "/common/area/trees",
    method: "get"
  });
}

// 上传图片
export function uploadImg(data: FormData) {
  return $http<FormData, { url: string; fileName: string; newFileName: string }>({
    url: "/common/upload",
    method: "post",
    data
  });
}

// 根据字典类型查询字典数据信息
export function getDicts(dictType: string) {
  return $http<never, SysDictResponse[]>({
    url: "/getDicts/" + dictType,
    method: "get"
  });
}

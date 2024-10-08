import { $http } from "@/utils/request";
import type { LoginParams } from "#/api";
import type { AppRouteRecordRaw } from "#/utils";
import type { SysUserData } from "#/api/system/user.d";

// 登录
export function login(data: LoginParams) {
  return $http<LoginParams, { token: string }>({
    url: "/login",
    method: "post",
    data
  });
}
// 登出
export function logout() {
  return $http({
    url: "/logout",
    method: "post"
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
export function getCodeImg() {
  return $http<never, { captchaEnabled: boolean; img: string; uuid: string }>({
    url: "/captchaImage",
    method: "get"
  });
}
// 获取当前用户信息
export function getInfo() {
  return $http<never, { roles: string[]; user: SysUserData }>({
    url: "/getInfo",
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

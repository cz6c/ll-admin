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
  return $http<never, never>({
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
// export const getAreaList = createGet<never, any>("/admin/getAreaList");
export function getAreaList() {
  return $http<never, any>({
    url: "/admin/getAreaList",
    method: "get"
  });
}

// 上传图片
// export const uploadImg = createPost<FormData, { url: string }>("/api/files/upload");
export function uploadImg(data: FormData) {
  return $http<FormData, { url: string }>({
    url: "/api/files/upload",
    method: "post",
    data
  });
}

// 获取七牛云上传token
// export const getQiniuToken = createGet<never, { token: string; key: string; domain: string }>("/api/getQiniuToken");
export function getQiniuToken() {
  return $http<never, { token: string; key: string; domain: string }>({
    url: "/api/getQiniuToken",
    method: "get"
  });
}

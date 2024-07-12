import { createGet, createPost } from "@/utils/request";
import { LoginParams, GetListResponse } from "./index.d";
import type { AppRouteRecordRaw } from "@/router/type";
import { UserItem } from "../system/user/index.d";

// 登录
export const login = createPost<LoginParams, { token: string }>("/login");
// 登出
export const logout = createPost<never, never>("/logout");
// 注册
export const register = createPost<LoginParams, never>("/register");
// 获取验证图片
export const getCodeImg = createGet<never, { captchaEnabled: boolean; img: string; uuid: string }>(
  "/captchaImage",
);
// 获取当前用户信息
export const getInfo = createGet<never, { permissions: string[]; roles: string[]; user: UserItem }>("/getInfo");
// 获取当前用户菜单
export const getRouters = createGet<never, GetListResponse<AppRouteRecordRaw>>("/getRouters");

// 获取按钮权限
export const getPermCodeList = createGet<never, string[]>("/admin/getPermCodeList");
// 获取城市地区
export const getAreaList = createGet<never, any>("/admin/getAreaList");

// 上传图片
export const uploadImg = createPost<FormData, { url: string }>("/api/files/upload");

// 获取七牛云上传token
export const getQiniuToken = createGet<never, { token: string; key: string; domain: string }>("/api/getQiniuToken");

import { createGet, createPost } from "@/utils/request";
import { LoginParams, GetListResponse } from "./index.d";
import type { AppRouteRecordRaw } from "@/router/type";

// 登录
export const login = createPost<LoginParams, { token: string }>("/auth/login");

// 获取当前用户菜单
export const getMenuList = createGet<never, GetListResponse<AppRouteRecordRaw>>("/admin/getMenuList");
// 获取按钮权限
export const getPermCodeList = createGet<never, string[]>("/admin/getPermCodeList");
// 获取城市地区
export const getAreaList = createGet<never, any>("/admin/getAreaList");

// 上传图片
export const uploadImg = createPost<FormData, { url: string }>("/api/files/upload");

// 获取七牛云上传token
export const getQiniuToken = createGet<never, { token: string; key: string; domain: string }>("/api/getQiniuToken");

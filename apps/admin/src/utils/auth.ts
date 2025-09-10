// 控制token
import Cookies from "js-cookie";
import { generateUUID } from "@llcz/common";
import { WebStorage } from "./storage";

export const TokenKey = "authorized-token";
export const isRemembered = true;
export const loginDay = 7;

/** 获取`token` */
export function getToken(): { token: string } | null {
  // 此处与`TokenKey`相同，此写法解决初始化时`Cookies`中不存在`TokenKey`报错
  return Cookies.get(TokenKey) ? JSON.parse(Cookies.get(TokenKey)) : null;
}

export function setToken(token: string) {
  const cookieString = JSON.stringify({
    token,
    expires: isRemembered ? loginDay : 0
  });

  Cookies.set(
    TokenKey,
    cookieString,
    isRemembered
      ? {
          expires: loginDay
        }
      : {}
  );
}

export function removeToken() {
  Cookies.remove(TokenKey);
}

/** 格式化token（jwt格式） */
export const formatToken = (token: string): string => {
  return "Bearer " + token;
};

const uuidStorage = new WebStorage("localStorage");

/**
 * @description: 获取设备唯一标识
 * @return userId
 */
export function getPlatFormUUID() {
  let userId = uuidStorage.getItem("platFormUUID") || "";
  if (!userId) {
    userId = generateUUID();
    uuidStorage.setItem("platFormUUID", userId);
  }
  return userId;
}

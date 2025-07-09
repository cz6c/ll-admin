// 控制token
import { WebStorage } from "@/utils/storage";
import { generateUUID } from "@llcz/common";

const tokenStorage = new WebStorage("sessionStorage");

export function getToken() {
  return tokenStorage.getItem("token");
}

export function setToken(token: string) {
  return tokenStorage.setItem("token", token);
}

export function removeToken() {
  return tokenStorage.removeItem("token");
}

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

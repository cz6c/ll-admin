// 控制token
import { WebStorage } from "@/utils/storage";

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

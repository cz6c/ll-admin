// 控制token
import { LocalStorage } from "@/utils/storage";

const TokenKey = "token";

const tokenStorage = new LocalStorage(TokenKey, "");

export function getToken() {
  return tokenStorage.getItem();
}

export function setToken(token: string) {
  return tokenStorage.setItem(token);
}

export function removeToken() {
  return tokenStorage.removeItem();
}

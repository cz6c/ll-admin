const prefix = "c.";

export class WebStorage<T = any> {
  private storageType: "localStorage" | "sessionStorage";
  constructor(storageType: "localStorage" | "sessionStorage") {
    this.storageType = storageType;
  }
  /** 设置值 */
  setItem(key: string, value: T) {
    const newKey = prefix + key;
    window[this.storageType].setItem(newKey, JSON.stringify(value));
  }
  /** 获取值 */
  getItem(key: string): T | null {
    const newKey = prefix + key;
    const value = window[this.storageType].getItem(newKey);
    try {
      return value && value !== "null" && value !== "undefined" ? (JSON.parse(value) as T) : null;
    } catch (error) {
      return value && value !== "null" && value !== "undefined" ? (value as unknown as T) : null;
    }
  }
  /** 删除值 */
  removeItem(key: string) {
    const newKey = prefix + key;
    window[this.storageType].removeItem(newKey);
  }
}

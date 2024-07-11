const prefix = "c.";

export class LocalStorage<T> {
  key: string;
  defaultValue: T;
  constructor(key: string, defaultValue: T) {
    this.key = prefix + key;
    this.defaultValue = defaultValue;
  }
  /** 设置值 */
  setItem(value: T) {
    sessionStorage.setItem(this.key, JSON.stringify(value));
    sessionStorage;
  }
  /** 获取值 */
  getItem(): T {
    const value = sessionStorage[this.key] && sessionStorage.getItem(this.key);
    if (value === undefined) return this.defaultValue;
    try {
      return value && value !== "null" && value !== "undefined" ? (JSON.parse(value) as T) : this.defaultValue;
    } catch (error) {
      return value && value !== "null" && value !== "undefined" ? (value as unknown as T) : this.defaultValue;
    }
  }
  /** 删除值 */
  removeItem() {
    sessionStorage.removeItem(this.key);
  }
}

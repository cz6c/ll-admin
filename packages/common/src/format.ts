/**
 * @description: 数字千分位分隔格式化
 * @param {string} number
 * @return {*}
 */
export function formatWithCommas(number: string | number): string {
  const parts = number.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

/**
 * @description: 文件大小格式化
 * @param {number} bytes
 * @return {*}
 */
export function formatFileSizeOptimized(bytes: number): string {
  const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];
  if (!bytes) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(2);
  return `${size} ${FILE_SIZE_UNITS[i]}`;
}

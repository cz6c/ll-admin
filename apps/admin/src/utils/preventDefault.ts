/** 是否为`img`标签 */
function isImgElement(element) {
  return typeof HTMLImageElement !== "undefined" ? element instanceof HTMLImageElement : element.tagName.toLowerCase() === "img";
}

// 在 src/main.ts 引入并调用即可 import { addPreventDefault } from "@/utils/preventDefault"; addPreventDefault();
export const addPreventDefault = () => {
  // 阻止通过键盘F12快捷键打开浏览器开发者工具面板
  window.document.addEventListener("keydown", ev => ev.key === "F12" && ev.preventDefault());
  // 阻止浏览器默认的右键菜单弹出（不会影响自定义右键事件）
  window.document.addEventListener("contextmenu", ev => ev.preventDefault());
  // 阻止页面元素选中
  window.document.addEventListener("selectstart", ev => ev.preventDefault());
  // 浏览器中图片通常默认是可拖动的，并且可以在新标签页或窗口中打开，或者将其拖动到其他应用程序中，此处将其禁用，使其默认不可拖动
  window.document.addEventListener("dragstart", ev => isImgElement(ev?.target) && ev.preventDefault());
};

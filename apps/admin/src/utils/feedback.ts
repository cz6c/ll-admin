/**
 * 全局反馈封装（Ant Design Vue）
 * 职责：统一 message / confirm / 带输入确认 / 全屏 loading，对业务保持稳定 API
 * 适用：路由守卫、CRUD、Settings 等调用点，避免页内直接依赖 antd API 细节
 */
import { h, shallowRef } from "vue";
import { Input, message, Modal } from "ant-design-vue";
import type { MessageArgsProps } from "ant-design-vue/es/message";

type MessageType = "success" | "info" | "warning" | "error";

let loadingClose: (() => void) | null = null;

function handleMessage(type: MessageType) {
  return function (content: MessageArgsProps["content"], duration?: number) {
    return message[type](content as string, duration);
  };
}

export default {
  confirm(content: string) {
    return new Promise<void>((resolve, reject) => {
      Modal.confirm({
        title: "系统提示",
        content,
        okText: "确定",
        cancelText: "取消",
        okType: "danger",
        onOk: () => resolve(),
        onCancel: () => reject()
      });
    });
  },
  /**
   * 带输入框的确认（如重置密码）
   * @param label 说明文案
   * @param options.password 默认 true，使用密码框
   * @param options.validate 返回错误文案则阻止关闭
   * @returns 用户输入；取消则 reject
   */
  confirmInput(
    label: string,
    options?: {
      placeholder?: string;
      password?: boolean;
      validate?: (value: string) => string | undefined;
    }
  ) {
    return new Promise<string>((resolve, reject) => {
      const value = shallowRef("");
      const InputComp = options?.password === false ? Input : Input.Password;
      Modal.confirm({
        title: "系统提示",
        content: () =>
          h("div", [
            h("p", { style: "margin-bottom: 8px" }, label),
            h(InputComp, {
              value: value.value,
              "onUpdate:value": (v: string) => {
                value.value = v;
              },
              placeholder: options?.placeholder
            })
          ]),
        okText: "确定",
        cancelText: "取消",
        maskClosable: false,
        async onOk() {
          const err = options?.validate?.(value.value);
          if (err) {
            message.error(err);
            return Promise.reject();
          }
          resolve(value.value);
        },
        onCancel: () => reject()
      });
    });
  },
  /** 打开全屏遮罩；文案仅作 tip（Ant message.loading） */
  loading(content: any) {
    loadingClose?.();
    loadingClose = message.loading(String(content ?? "加载中..."), 0);
  },
  closeLoading() {
    loadingClose?.();
    loadingClose = null;
  },
  message: {
    success: handleMessage("success"),
    info: handleMessage("info"),
    warning: handleMessage("warning"),
    error: handleMessage("error"),
    closeAll: message.destroy
  }
};

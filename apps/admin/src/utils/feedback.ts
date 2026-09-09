/**
 * 全局反馈封装（Ant Design Vue）
 * 职责：统一 message / confirm / 带输入确认 / 全屏 loading，对业务保持稳定 API
 * 适用：路由守卫、CRUD、Settings 等调用点，避免页内直接依赖 antd API 细节
 */
import { h, shallowRef } from "vue";
import { Input, message, Modal } from "ant-design-vue";
import type { MessageArgsProps } from "ant-design-vue/es/message";

type MessageType = "success" | "info" | "warning" | "error";

/** confirm 可选参数；缺省与历史「系统提示 / 危险确定」一致 */
export type FeedbackConfirmOptions = {
  title?: string;
  okText?: string;
  cancelText?: string;
  okType?: "primary" | "danger" | "default";
  /**
   * 确认按钮冷却毫秒；期间禁用并显示倒计时文案
   * @note 用于不可轻易撤销的删云等操作
   */
  cooldownMs?: number;
};

let loadingClose: (() => void) | null = null;

function handleMessage(type: MessageType) {
  return function (content: MessageArgsProps["content"], duration?: number) {
    return message[type](content as string, duration);
  };
}

export default {
  /**
   * 确认框；确定 resolve，取消 reject
   * @param content 正文
   * @param options 标题 / 按钮文案 / 冷却；省略时行为与历史单参一致
   */
  confirm(content: string, options?: FeedbackConfirmOptions) {
    const title = options?.title ?? "系统提示";
    const okTextReady = options?.okText ?? "确定";
    const cancelText = options?.cancelText ?? "取消";
    const okType = options?.okType ?? "danger";
    const cooldownMs = options?.cooldownMs ?? 0;

    return new Promise<void>((resolve, reject) => {
      const modal = Modal.confirm({
        title,
        content,
        okText: cooldownMs > 0 ? `确认 (${Math.ceil(cooldownMs / 1000)}s)` : okTextReady,
        cancelText,
        okType,
        okButtonProps: cooldownMs > 0 ? { disabled: true } : undefined,
        onOk: () => resolve(),
        onCancel: () => reject()
      });

      if (cooldownMs <= 0) return;

      let remainMs = cooldownMs;
      const timer = window.setInterval(() => {
        remainMs -= 200;
        if (remainMs <= 0) {
          window.clearInterval(timer);
          modal.update({ okText: okTextReady, okButtonProps: { disabled: false } });
          return;
        }
        modal.update({ okText: `确认 (${Math.ceil(remainMs / 1000)}s)` });
      }, 200);
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

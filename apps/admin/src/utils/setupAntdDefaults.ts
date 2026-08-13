/**
 * Ant Design Vue 全局默认覆盖
 * 背景：antdv4 ConfigProvider 无 React 5.24+ 的 component config（如 modal.centered），
 * 只能改组件 props 默认值 / 包装静态方法。
 * 适用：main.ts 启动时调用一次
 */
import { Modal } from "ant-design-vue";
import type { ModalFuncProps } from "ant-design-vue";

type ModalStaticFn = (props: ModalFuncProps) => ReturnType<typeof Modal.confirm>;

/**
 * 为 Modal 静态方法补默认 centered（不影响调用方显式传入 false）
 */
function withCenteredDefault(fn: ModalStaticFn): ModalStaticFn {
  return props => fn({ centered: true, ...props });
}

/** 注册 antd 全局默认：Modal 垂直居中 */
export function setupAntdDefaults() {
  // <a-modal> 默认居中
  const centeredProp = (Modal as unknown as { props: { centered: { default: boolean } } }).props?.centered;
  if (centeredProp) {
    centeredProp.default = true;
  }

  // Modal.confirm / info / success / error / warning 默认居中
  Modal.confirm = withCenteredDefault(Modal.confirm);
  Modal.info = withCenteredDefault(Modal.info);
  Modal.success = withCenteredDefault(Modal.success);
  Modal.error = withCenteredDefault(Modal.error);
  Modal.warning = withCenteredDefault(Modal.warning);
}

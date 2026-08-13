import type { FormInstance } from "ant-design-vue/es/form";
import { isFunction } from "@llcz/common";

/**
 * 表单提交 / 重置辅助
 * 职责：对接 ant-design-vue FormInstance.validate（Promise），成功后回调业务提交
 * 适用：各编辑弹窗与页面内 a-form ref
 */
export function useFrom(handleSubmit: Function) {
  /**
   * 校验通过后执行提交；校验失败时 ant Form.validate 会 reject
   * @param formEl a-form 实例
   */
  const submitForm = async (formEl: FormInstance | undefined) => {
    if (!formEl) return;
    try {
      await formEl.validate();
      console.log("submit!");
      if (handleSubmit && isFunction(handleSubmit)) {
        handleSubmit();
      } else {
        console.log("handleSubmit 不是一个函数");
      }
    } catch (fields) {
      console.log("error submit!", fields);
    }
  };

  const resetForm = (formEl: FormInstance | undefined) => {
    if (!formEl) return;
    formEl.resetFields();
  };

  return {
    resetForm,
    submitForm
  };
}

import type { FormInstance } from "element-plus";
import { isFunction } from "@packages/common";

export function useFrom(handleSubmit: Function) {
  const submitForm = async (formEl: FormInstance | undefined) => {
    if (!formEl) return;
    await formEl.validate((valid, fields) => {
      if (valid) {
        console.log("submit!");
        if (handleSubmit && isFunction(handleSubmit)) {
          handleSubmit();
        } else {
          console.log("handleSubmit 不是一个函数");
        }
      } else {
        console.log("error submit!", fields);
      }
    });
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

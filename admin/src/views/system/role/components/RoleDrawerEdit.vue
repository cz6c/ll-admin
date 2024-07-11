<template>
  <el-drawer v-model="dialog" title="新增角色" direction="ltr" class="cz-drawer" size="36%" @open="handleOpen">
    <div class="drawer__content">
      <el-form :model="formData" status-icon ref="ruleFormRef" :rules="rules" label-width="90px">
        <el-form-item label="roleName" prop="roleName">
          <el-input v-model="formData.roleName" autocomplete="off" />
        </el-form-item>
        <el-form-item label="menuIds" prop="menuIds">
          <TreeMenu v-model="formData.menuIds" />
        </el-form-item>
        <el-form-item label="remark" prop="remark">
          <el-input v-model="formData.remark" autocomplete="off" />
        </el-form-item>
      </el-form>
      <div class="drawer__footer">
        <el-button @click="dialog = false">Cancel</el-button>
        <el-button type="primary" :loading="loading" @click="submitForm(ruleFormRef)">{{
          loading ? "Submitting ..." : "Submit"
        }}</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup name="RoleDrawerEdit">
import { reactive, ref, computed, unref } from "vue";
import { FormInstance, FormRules } from "element-plus";
import { useFrom } from "@/hooks/useFrom";
import { getRoleInfoApi, saveRoleApi, updateRoleApi } from "@/api/system/role";
import { RoleInfo } from "@/api/system/role/index.d";
import TreeMenu from "./TreeMenu.vue";

const props = defineProps({
  modelValue: {
    type: Boolean,
  },
  id: {
    type: Number,
  },
});
const emits = defineEmits(["update:modelValue", "updateList"]);

const dialog = computed({
  get: () => props.modelValue,
  set: value => {
    emits("update:modelValue", value);
  },
});

const loading = ref(false);

const ruleFormRef = ref<FormInstance>();
const formData = reactive<RoleInfo>({
  roleName: "",
  remark: "",
  menuIds: [],
});
const rules = reactive<FormRules>({
  roleName: [
    { required: true, message: "Please input Activity name", trigger: "blur" },
    { min: 3, max: 5, message: "Length should be 3 to 5", trigger: "blur" },
  ],
  remark: [{ required: true, message: "Please input activity form", trigger: "blur" }],
  menuIds: [{ required: true, message: "Please input activity form", trigger: "change" }],
});
/**
 * @description: 表单提交
 */
async function handleSubmit() {
  loading.value = true;
  const json: RoleInfo = {
    ...formData,
  };
  json.menuIds = (json.menuIds as number[]).join(",");
  console.log(json);
  let api = saveRoleApi;
  if (props.id) {
    json.id = props.id;
    api = updateRoleApi;
  }
  try {
    await api(json);
    setTimeout(() => {
      loading.value = false;
      dialog.value = false;
      emits("updateList");
    }, 600);
  } catch (error) {
    loading.value = false;
  }
}

const { resetForm, submitForm } = useFrom(handleSubmit);

/**
 * @description: 打开
 */
async function handleOpen() {
  resetForm(unref(ruleFormRef));
  let data: RoleInfo = {
    roleName: "",
    remark: "",
    menuIds: "5",
  };
  if (props.id) {
    const res = await getRoleInfoApi({ id: props.id });
    data = res.data;
  }
  handleData(data);
}
/**
 * @description: 处理数据
 * @param {*} data
 */
function handleData(data: RoleInfo) {
  for (const key in formData) {
    if (key === "menuIds") {
      formData[key] = (data[key] as string).split(",").map(c => Number(c));
    } else {
      (formData as any)[key] = data[key as keyof RoleInfo];
    }
  }
}
</script>

<style scoped lang="scss"></style>

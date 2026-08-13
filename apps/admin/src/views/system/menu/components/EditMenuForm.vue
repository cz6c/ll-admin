<script setup lang="ts">
import { updateMenu, addMenu, getMenuDetail } from "@/api/system/menu";
import { useDict } from "@/hooks/useDict";
import type { FormInstance, Rule } from "ant-design-vue/es/form";
import IconSelect from "@/components/IconSelect/index.vue";
import $feedback from "@/utils/feedback";

defineOptions({
  name: "EditMenuForm"
});

const props = defineProps({
  menuId: { type: Number },
  parentId: { type: Number },
  parentName: { type: String },
  isPerm: { type: Boolean }
});
const $emit = defineEmits(["success", "cancel"]);

const { StatusEnum, YesNoEnum } = toRefs(useDict("StatusEnum", "YesNoEnum"));

const menuRef = ref<FormInstance>();
const data = reactive({
  form: {
    menuId: undefined,
    parentId: 0,
    menuName: "",
    icon: "",
    orderNum: 0,
    isFrame: "1",
    isCache: "0",
    status: "0",
    component: "",
    name: "",
    perm: "",
    menuType: "M",
    path: "",
    parentName: ""
  },
  rules: {
    menuName: [{ required: true, message: "菜单名称不能为空", trigger: "blur" }],
    orderNum: [{ required: true, message: "菜单顺序不能为空", trigger: "blur" }],
    path: [{ required: true, message: "路由地址不能为空", trigger: "blur" }],
    name: [{ required: true, message: "组件名称不能为空", trigger: "blur" }],
    component: [{ required: true, message: "组件路径不能为空", trigger: "blur" }],
    perm: [{ required: true, message: "功能标识不能为空", trigger: "blur" }]
  } as Record<string, Rule[]>
});

const { form, rules } = toRefs(data);

watch(
  () => unref(form).isFrame,
  val => {
    form.value.component = val === "0" ? "IFrame" : form.value.component;
  }
);

async function getInfo() {
  if (props.menuId) {
    const { data } = await getMenuDetail(props.menuId);
    for (const key of Object.keys(form.value)) {
      form.value[key] = data[key];
    }
  } else {
    form.value.parentId = props.parentId;
    form.value.parentName = props.parentName;
    form.value.menuType = props.isPerm ? "F" : "M";
  }
  form.value.component = form.value.parentId === 0 ? "Layout" : form.value.component;
}

/** 提交按钮 */
async function submitForm() {
  try {
    await unref(menuRef)?.validate();
  } catch {
    return;
  }
  const flag = form.value.menuId != undefined;
  flag ? await updateMenu(form.value) : await addMenu(form.value);
  $feedback.message.success(flag ? "修改成功" : "新增成功");
  $emit("success");
  $emit("cancel");
}

const fOptionts = [
  {
    label: "新增",
    value: "add"
  },
  {
    label: "编辑",
    value: "edit"
  },
  {
    label: "删除",
    value: "remove"
  },
  {
    label: "查询",
    value: "query"
  },
  {
    label: "导入",
    value: "import"
  },
  {
    label: "导出",
    value: "export"
  }
];
function handleF({ label, value }) {
  form.value.menuName = label;
  form.value.perm = value;
}

getInfo();
</script>

<template>
  <div>
    <a-form ref="menuRef" :model="form" :rules="rules" :label-col="{ style: { width: '100px' } }">
      <a-row>
        <a-col :span="24">
          <a-form-item v-if="form.parentName" label="上级菜单">
            {{ form.parentName }}
          </a-form-item>
        </a-col>
        <template v-if="form.menuType === 'F'">
          <a-col :span="24">
            <a-form-item label="快捷输入">
              <a-space :size="8" wrap>
                <a-button v-for="{ label, value } in fOptionts" :key="value" @click="handleF({ label, value })">
                  {{ label }}
                </a-button>
              </a-space>
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item label="功能名称" name="menuName">
              <a-input v-model:value="form.menuName" placeholder="请输入功能名称" />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item name="perm">
              <template #label>
                <span v-tippy="{ content: '页面功能权限标识，如`add,edit`' }">
                  <IconifyIcon icon="ant-design:question-circle-filled" />
                  功能标识
                </span>
              </template>
              <a-input v-model:value="form.perm" placeholder="请输入功能标识" />
            </a-form-item>
          </a-col>
        </template>
        <template v-else>
          <a-col :span="12">
            <a-form-item label="菜单名称" name="menuName">
              <a-input v-model:value="form.menuName" placeholder="请输入菜单名称" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="菜单图标" name="icon">
              <IconSelect v-model="form.icon" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item name="component">
              <template #label>
                <span v-tippy="{ content: '如：`system/user/index`，默认在`views`目录下' }"> 组件路径 </span>
              </template>
              <a-input v-model:value="form.component" placeholder="请输入组件路径" :disabled="form.parentId === 0 || form.isFrame === '0'" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="显示排序" name="orderNum">
              <a-input-number v-model:value="form.orderNum" :min="0" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item name="path">
              <template #label>
                <span v-tippy="{ content: '如：`/system/user`，如外链必须以`http(s)://`开头' }"> 路由地址 </span>
              </template>
              <a-input v-model:value="form.path" placeholder="请输入路由地址" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item name="isFrame">
              <template #label>
                <span v-tippy="{ content: '选择外链，组件路径为IFrame，路由地址必须以`http(s)://`开头' }"> 是否外链 </span>
              </template>
              <a-radio-group v-model:value="form.isFrame" :disabled="form.parentId === 0">
                <a-radio v-for="dict in YesNoEnum" :key="dict.value" :value="dict.value">{{ dict.label }}</a-radio>
              </a-radio-group>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item name="name">
              <template #label>
                <span v-tippy="{ content: '如：`User`，需与页面组件name一致，使用大驼峰命名' }"> 组件名称 </span>
              </template>
              <a-input v-model:value="form.name" placeholder="请输入组件名称" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item name="isCache">
              <template #label>
                <span v-tippy="{ content: '选择缓存，则会被`keep-alive`缓存，需匹配组件名称使用' }"> 是否缓存 </span>
              </template>
              <a-radio-group v-model:value="form.isCache">
                <a-radio v-for="dict in YesNoEnum" :key="dict.value" :value="dict.value">{{ dict.label }}</a-radio>
              </a-radio-group>
            </a-form-item>
          </a-col>
        </template>
        <a-col :span="12">
          <a-form-item name="status" label="启用状态">
            <a-radio-group v-model:value="form.status">
              <a-radio v-for="dict in StatusEnum" :key="dict.value" :value="dict.value">{{ dict.label }}</a-radio>
            </a-radio-group>
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    <div class="flex items-center justify-center">
      <a-space>
        <a-button type="primary" @click="submitForm">确 定</a-button>
        <a-button @click="$emit('cancel')">取 消</a-button>
      </a-space>
    </div>
  </div>
</template>

<style scoped lang="scss"></style>

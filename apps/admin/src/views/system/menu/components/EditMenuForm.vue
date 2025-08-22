<script setup lang="ts">
import { updateMenu, addMenu, getMenuDetail } from "@/api/system/menu";
import { useDict } from "@/hooks/useDict";
import { FormInstance, FormRules, ClickOutside as vClickOutside } from "element-plus";
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

const menuRef = ref<FormInstance>(null);
const data = reactive({
  form: {
    menuId: undefined,
    parentId: 0,
    menuName: "",
    icon: "",
    orderNum: 0,
    isFrame: "1",
    isCache: "0",
    visible: "0",
    activeMenu: "",
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
  } as FormRules
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
function submitForm() {
  unref(menuRef).validate(async valid => {
    if (valid) {
      const flag = form.value.menuId != undefined;
      flag ? await updateMenu(form.value) : await addMenu(form.value);
      $feedback.message.success(flag ? "修改成功" : "新增成功");
      $emit("success");
      $emit("cancel");
    }
  });
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
    <el-form ref="menuRef" :model="form" :rules="rules" label-width="100px">
      <el-row>
        <el-col :span="24">
          <el-form-item v-if="form.parentName" label="上级菜单">
            {{ form.parentName }}
          </el-form-item>
        </el-col>
        <el-col v-if="form.menuType === 'F'" :span="24">
          <el-form-item label="快捷输入">
            <el-button v-for="{ label, value } in fOptionts" :key="value" @click="handleF({ label, value })">
              {{ label }}
            </el-button>
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item :label="`${form.menuType === 'M' ? '菜单' : '功能'}名称`" prop="menuName">
            <el-input v-model="form.menuName" :placeholder="`请输入${form.menuType === 'M' ? '菜单' : '功能'}名称`" />
          </el-form-item>
        </el-col>
        <el-col v-if="form.menuType === 'F'" :span="24">
          <el-form-item prop="perm">
            <template #label>
              <span v-tippy="{ content: '页面功能权限标识，如`add,edit`' }">
                <IconifyIcon icon="ep:question-filled" />
                功能标识
              </span>
            </template>
            <el-input v-model="form.perm" placeholder="请输入功能标识" />
          </el-form-item>
        </el-col>
        <template v-else>
          <el-col :span="24">
            <el-form-item label="菜单图标" prop="icon">
              <IconSelect v-model="form.icon" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="显示排序" prop="orderNum">
              <el-input-number v-model="form.orderNum" controls-position="right" :min="0" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item prop="component">
              <template #label>
                <span v-tippy="{ content: '如：`system/user/index`，默认在`views`目录下' }"> 组件路径 </span>
              </template>
              <el-input v-model="form.component" placeholder="请输入组件路径" :disabled="form.parentId === 0 || form.isFrame === '0'" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item prop="path">
              <template #label>
                <span v-tippy="{ content: '如：`/system/user`，如外链必须以`http(s)://`开头' }"> 路由地址 </span>
              </template>
              <el-input v-model="form.path" placeholder="请输入路由地址" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item prop="isFrame">
              <template #label>
                <span v-tippy="{ content: '选择外链，组件路径为IFrame，路由地址必须以`http(s)://`开头' }"> 是否外链 </span>
              </template>
              <el-radio-group v-model="form.isFrame" :disabled="form.parentId === 0">
                <el-radio v-for="dict in YesNoEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item prop="name">
              <template #label>
                <span v-tippy="{ content: '如：`User`，需与页面组件name一致，使用大驼峰命名' }"> 组件名称 </span>
              </template>
              <el-input v-model="form.name" placeholder="请输入组件名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item prop="isCache">
              <template #label>
                <span v-tippy="{ content: '选择缓存，则会被`keep-alive`缓存，需匹配组件名称使用' }"> 是否缓存 </span>
              </template>
              <el-radio-group v-model="form.isCache">
                <el-radio v-for="dict in YesNoEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item prop="activeMenu">
              <el-input v-model="form.activeMenu" placeholder="请输入高亮菜单" maxlength="255" />
              <template #label>
                <span v-tippy="{ content: '选择隐藏时，可配置高亮菜单，如：`/system/user`' }"> 高亮菜单 </span>
              </template>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item prop="visible">
              <template #label>
                <span v-tippy="{ content: '选择隐藏则菜单将不会出现在侧边栏，但仍然可以访问' }"> 显示状态 </span>
              </template>
              <el-radio-group v-model="form.visible">
                <el-radio v-for="dict in YesNoEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
              </el-radio-group>
            </el-form-item>
          </el-col>
        </template>
        <el-col :span="12">
          <el-form-item prop="status" label="启用状态">
            <el-radio-group v-model="form.status">
              <el-radio v-for="dict in StatusEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
            </el-radio-group>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <div class="flex items-center justify-center">
      <el-button type="primary" @click="submitForm">确 定</el-button>
      <el-button @click="$emit('cancel')">取 消</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss"></style>

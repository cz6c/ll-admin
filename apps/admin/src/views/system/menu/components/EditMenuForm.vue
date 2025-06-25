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

const showChooseIcon = ref(false);
const iconSelectRef = ref(null);
const menuRef = ref<FormInstance>(null);
const data = reactive({
  form: {
    menuId: undefined,
    parentId: 0,
    menuName: "",
    icon: undefined,
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
    unref(rules).name[0].required = val !== "0";
    unref(rules).component[0].required = val !== "0";
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
}

/** 展示下拉图标 */
function showSelectIcon() {
  iconSelectRef.value.reset();
  showChooseIcon.value = true;
}
/** 选择图标 */
function selected(name) {
  form.value.icon = name;
  showChooseIcon.value = false;
}
/** 图标外层点击隐藏下拉列表 */
function hideSelectIcon(event) {
  var elem = event.relatedTarget || event.srcElement || event.target || event.currentTarget;
  var className = elem.className;
  if (className !== "el-input__inner") {
    showChooseIcon.value = false;
  }
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
              <span>
                <el-tooltip content="页面功能权限标识，如`add,edit`" placement="top">
                  <el-icon><question-filled /></el-icon>
                </el-tooltip>
                功能标识
              </span>
            </template>
            <el-input v-model="form.perm" placeholder="请输入功能标识" />
          </el-form-item>
        </el-col>
        <template v-else>
          <el-col :span="24">
            <el-form-item label="菜单图标" prop="icon">
              <el-popover
                v-model:visible="showChooseIcon"
                placement="bottom-start"
                :width="540"
                trigger="click"
                @show="showSelectIcon"
              >
                <template #reference>
                  <el-input
                    v-model="form.icon"
                    v-click-outside="hideSelectIcon"
                    placeholder="点击选择图标"
                    readonly
                    @blur="showSelectIcon"
                  >
                    <template #prefix>
                      <svg-icon
                        v-if="form.icon"
                        :name="form.icon"
                        class="el-input__icon"
                        style="height: 32px; width: 16px"
                      />
                      <el-icon v-else style="height: 32px; width: 16px"><search /></el-icon>
                    </template>
                  </el-input>
                </template>
                <icon-select ref="iconSelectRef" :active-icon="form.icon" @selected="selected" />
              </el-popover>
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
                <span>
                  <el-tooltip content="组件路径，如：`system/user/index`，默认在`views`目录下" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  组件路径
                </span>
              </template>
              <el-input v-model="form.component" placeholder="请输入组件路径" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item prop="path">
              <template #label>
                <span>
                  <el-tooltip content="访问的路由地址，如：`user`，如外链需以`http(s)://`开头" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  路由地址
                </span>
              </template>
              <el-input v-model="form.path" placeholder="请输入路由地址" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item prop="isFrame">
              <template #label>
                <span>
                  <el-tooltip content="选择是外链则路由地址需要以`http(s)://`开头" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  是否外链
                </span>
              </template>
              <el-radio-group v-model="form.isFrame">
                <el-radio v-for="dict in YesNoEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item prop="name">
              <template #label>
                <span>
                  <el-tooltip content="组件name，需与页面组件name一致，使用大驼峰命名，如：`User`" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  组件名称
                </span>
              </template>
              <el-input v-model="form.name" placeholder="请输入组件名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item prop="isCache">
              <template #label>
                <span>
                  <el-tooltip content="选择缓存则会被`keep-alive`缓存，需匹配组件名称使用" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  是否缓存
                </span>
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
                <span>
                  <el-tooltip content="选择隐藏路由时，可配置高亮菜单，如：`/system/user`" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  高亮菜单
                </span>
              </template>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item prop="visible">
              <template #label>
                <span>
                  <el-tooltip content="选择隐藏则路由将不会出现在侧边栏，但仍然可以访问" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  显示状态
                </span>
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

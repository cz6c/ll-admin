<script setup lang="ts">
import { addRole, getRole, updateRole } from "@/api/system/role";
import { roleDeptTreeSelect, deptTreeSelect } from "@/api/system/dept";
import { roleMenuTreeSelect, menuTreeSelect } from "@/api/system/menu";
import { useDict } from "@/hooks/useDict";
import { FormInstance, FormRules } from "element-plus";
import $feedback from "@/utils/feedback";

defineOptions({
  name: "EditRoleForm"
});

const props = defineProps({
  roleId: { type: Number }
});
const $emit = defineEmits(["success", "cancel"]);

const { StatusEnum, DataScopeEnum } = toRefs(useDict("StatusEnum", "DataScopeEnum"));

const menuOptions = ref([]);
const menuExpand = ref(false);
const menuNodeAll = ref(false);
const menuRef = ref(null);
const deptOptions = ref([]);
const deptExpand = ref(false);
const deptNodeAll = ref(false);
const deptRef = ref(null);
const roleRef = ref<FormInstance>(null);
const data = reactive({
  form: {
    roleId: undefined,
    roleName: undefined,
    roleKey: undefined,
    roleSort: 0,
    dataScope: "1",
    status: "0",
    menuIds: [],
    deptIds: [],
    remark: undefined
  },
  rules: {
    roleName: [{ required: true, message: "角色名称不能为空", trigger: "blur" }],
    roleKey: [{ required: true, message: "权限字符不能为空", trigger: "blur" }],
    dataScope: [{ required: true, message: "数据权限不能为空", trigger: "blur" }],
    roleSort: [{ required: true, message: "角色顺序不能为空", trigger: "blur" }]
  } as FormRules
});

const { form, rules } = toRefs(data);

async function getInfo() {
  if (props.roleId) {
    const { data } = await getRole(props.roleId);
    for (const key of Object.keys(form.value)) {
      form.value[key] = data[key];
    }
    nextTick(() => {
      /** 根据角色ID查询菜单树结构 */
      roleMenuTreeSelect(props.roleId).then(res => {
        menuOptions.value = res.data.menus;
        menuRef.value.setCheckedKeys(res.data.checkedIds, true);
      });
      /** 根据角色ID查询部门树结构 */
      roleDeptTreeSelect(props.roleId).then(res => {
        deptOptions.value = res.data.depts;
        deptRef.value.setCheckedKeys(res.data.checkedIds, true);
      });
    });
  }
}

/** 查询菜单树结构 */
function getMenuTreeSelect() {
  menuTreeSelect().then(response => {
    menuOptions.value = response.data;
  });
}
/** 查询部门树结构 */
function getDeptTreeSelect() {
  deptTreeSelect().then(response => {
    deptOptions.value = response.data;
  });
}

/** 树权限（展开/折叠）*/
function handleCheckedTreeExpand(value, type) {
  if (type === 1) {
    let treeList = deptOptions.value;
    let key = deptRef.value.store.key;
    for (let i = 0; i < treeList.length; i++) {
      deptRef.value.store.nodesMap[treeList[i][key]].expanded = value;
    }
  } else {
    let treeList = menuOptions.value;
    let key = menuRef.value.store.key;
    for (let i = 0; i < treeList.length; i++) {
      menuRef.value.store.nodesMap[treeList[i][key]].expanded = value;
    }
  }
}
/** 树权限（全选/全不选） */
function handleCheckedTreeNodeAll(value, type) {
  if (type === 1) {
    deptRef.value.setCheckedNodes(value ? deptOptions.value : []);
  } else {
    menuRef.value.setCheckedNodes(value ? menuOptions.value : []);
  }
}
/** 所有勾选菜单节点数据 */
function getMenuAllCheckedKeys() {
  // 目前被选中的菜单节点
  let checkedKeys = menuRef.value.getCheckedKeys();
  // 半选中的菜单节点
  let halfCheckedKeys = menuRef.value.getHalfCheckedKeys();
  checkedKeys.unshift.apply(checkedKeys, halfCheckedKeys);
  return checkedKeys;
}
/** 所有勾选菜单节点数据 */
function getDeptAllCheckedKeys() {
  // 目前被选中的菜单节点
  let checkedKeys = deptRef.value.getCheckedKeys();
  // 半选中的菜单节点
  let halfCheckedKeys = deptRef.value.getHalfCheckedKeys();
  checkedKeys.unshift.apply(checkedKeys, halfCheckedKeys);
  return checkedKeys;
}

/** 提交按钮 */
function submitForm() {
  unref(roleRef).validate(async valid => {
    if (valid) {
      form.value.deptIds = getDeptAllCheckedKeys();
      form.value.menuIds = getMenuAllCheckedKeys();
      const flag = form.value.roleId != undefined;
      flag ? await updateRole(form.value) : await addRole(form.value);
      $feedback.message.success(flag ? "修改成功" : "新增成功");
      $emit("success");
      $emit("cancel");
    }
  });
}

getMenuTreeSelect();
getDeptTreeSelect();
getInfo();
</script>

<template>
  <div>
    <el-form ref="roleRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="角色名称" prop="roleName">
        <el-input v-model="form.roleName" placeholder="请输入角色名称" />
      </el-form-item>
      <el-form-item prop="roleKey">
        <template #label>
          <span>
            <el-tooltip content="控制器中定义的权限字符，如：admin对应服务端@RequireRole('admin')" placement="top">
              <IconifyIcon icon="ep:question-filled" />
            </el-tooltip>
            权限字符
          </span>
        </template>
        <el-input v-model="form.roleKey" placeholder="请输入权限字符" />
      </el-form-item>
      <el-form-item label="数据权限" prop="dataScope">
        <el-select v-model="form.dataScope" placeholder="数据权限范围">
          <el-option v-for="dict in DataScopeEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.dataScope === '2'" label="自定义范围">
        <div>
          <el-checkbox v-model="deptExpand" @change="handleCheckedTreeExpand($event, 1)">展开/折叠</el-checkbox>
          <el-checkbox v-model="deptNodeAll" @change="handleCheckedTreeNodeAll($event, 1)">全选/全不选</el-checkbox>
          <el-scrollbar style="height: 100px">
            <el-tree
              ref="deptRef"
              class="tree-border"
              :data="deptOptions"
              show-checkbox
              node-key="deptId"
              check-strictly
              :props="{ label: 'deptName', children: 'children' }"
            />
          </el-scrollbar>
        </div>
      </el-form-item>
      <el-form-item label="菜单权限">
        <div>
          <el-checkbox v-model="menuExpand" @change="handleCheckedTreeExpand($event, 2)">展开/折叠</el-checkbox>
          <el-checkbox v-model="menuNodeAll" @change="handleCheckedTreeNodeAll($event, 2)">全选/全不选</el-checkbox>
          <el-scrollbar style="height: 100px">
            <el-tree
              ref="menuRef"
              class="tree-border"
              :data="menuOptions"
              show-checkbox
              node-key="menuId"
              check-strictly
              :props="{ label: 'menuName', children: 'children' }"
            />
          </el-scrollbar>
        </div>
      </el-form-item>
      <el-form-item label="角色顺序" prop="roleSort">
        <el-input-number v-model="form.roleSort" controls-position="right" :min="0" />
      </el-form-item>
      <el-form-item label="状态">
        <el-radio-group v-model="form.status">
          <el-radio v-for="dict in StatusEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
        </el-radio-group>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" placeholder="请输入内容" />
      </el-form-item>
    </el-form>
    <div class="flex items-center justify-center">
      <el-button type="primary" @click="submitForm">确 定</el-button>
      <el-button @click="$emit('cancel')">取 消</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss"></style>

<script setup lang="ts">
/**
 * 角色编辑表单
 * 职责：新增/编辑角色，含数据权限部门树与菜单权限树勾选
 * 适用：角色列表弹窗；树勾选态用 ant Tree checkedKeys
 */
import { addRole, getRole, updateRole } from "@/api/system/role";
import { roleDeptTreeSelect, deptTreeSelect } from "@/api/system/dept";
import { roleMenuTreeSelect, menuTreeSelect } from "@/api/system/menu";
import { useDict } from "@/hooks/useDict";
import type { FormInstance, Rule } from "ant-design-vue/es/form";
import type { Key } from "ant-design-vue/es/_util/type";
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
const menuExpandedKeys = ref<Key[]>([]);
/** checkStrictly 时 ant Tree 使用 { checked, halfChecked } 结构 */
const menuCheckedKeys = ref<{ checked: Key[]; halfChecked: Key[] }>({ checked: [], halfChecked: [] });

const deptOptions = ref([]);
const deptExpand = ref(false);
const deptNodeAll = ref(false);
const deptExpandedKeys = ref<Key[]>([]);
const deptCheckedKeys = ref<{ checked: Key[]; halfChecked: Key[] }>({ checked: [], halfChecked: [] });

const roleRef = ref<FormInstance>();
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
  } as Record<string, Rule[]>
});

const { form, rules } = toRefs(data);

/** 递归收集树节点 key，用于展开/全选 */
function collectKeys(nodes: any[], keyField: string): Key[] {
  const keys: Key[] = [];
  const walk = (list: any[]) => {
    for (const n of list || []) {
      keys.push(n[keyField]);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return keys;
}

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
        menuCheckedKeys.value = { checked: res.data.checkedIds || [], halfChecked: [] };
      });
      /** 根据角色ID查询部门树结构 */
      roleDeptTreeSelect(props.roleId).then(res => {
        deptOptions.value = res.data.depts;
        deptCheckedKeys.value = { checked: res.data.checkedIds || [], halfChecked: [] };
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
function handleCheckedTreeExpand(checked: boolean, type: number) {
  if (type === 1) {
    deptExpandedKeys.value = checked ? collectKeys(deptOptions.value, "deptId") : [];
  } else {
    menuExpandedKeys.value = checked ? collectKeys(menuOptions.value, "menuId") : [];
  }
}
/** 树权限（全选/全不选） */
function handleCheckedTreeNodeAll(checked: boolean, type: number) {
  if (type === 1) {
    deptCheckedKeys.value = {
      checked: checked ? collectKeys(deptOptions.value, "deptId") : [],
      halfChecked: []
    };
  } else {
    menuCheckedKeys.value = {
      checked: checked ? collectKeys(menuOptions.value, "menuId") : [],
      halfChecked: []
    };
  }
}
/** 菜单勾选结果：含全选 + 半选节点 id（后端权限树提交约定） */
function getMenuAllCheckedKeys() {
  return [...menuCheckedKeys.value.checked, ...menuCheckedKeys.value.halfChecked];
}
/** 所有勾选部门节点数据 */
function getDeptAllCheckedKeys() {
  return [...deptCheckedKeys.value.checked, ...deptCheckedKeys.value.halfChecked];
}

/** 提交按钮 */
async function submitForm() {
  try {
    await unref(roleRef)?.validate();
  } catch {
    return;
  }
  form.value.deptIds = getDeptAllCheckedKeys();
  form.value.menuIds = getMenuAllCheckedKeys();
  const flag = form.value.roleId != undefined;
  flag ? await updateRole(form.value) : await addRole(form.value);
  $feedback.message.success(flag ? "修改成功" : "新增成功");
  $emit("success");
  $emit("cancel");
}

getMenuTreeSelect();
getDeptTreeSelect();
getInfo();
</script>

<template>
  <div>
    <a-form ref="roleRef" :model="form" :rules="rules" :label-col="{ style: { width: '100px' } }">
      <a-form-item label="角色名称" name="roleName">
        <a-input v-model:value="form.roleName" placeholder="请输入角色名称" />
      </a-form-item>
      <a-form-item name="roleKey">
        <template #label>
          <span v-tippy="{ content: `控制器中定义的权限字符，如：admin对应服务端@RequireRole('admin')` }"> 权限字符 </span>
        </template>
        <a-input v-model:value="form.roleKey" placeholder="请输入权限字符" />
      </a-form-item>
      <a-form-item label="数据权限" name="dataScope">
        <a-select v-model:value="form.dataScope" placeholder="数据权限范围" :options="DataScopeEnum" style="width: 100%" />
      </a-form-item>
      <a-form-item v-if="form.dataScope === '2'" label="自定义范围">
        <div>
          <a-checkbox v-model:checked="deptExpand" @change="e => handleCheckedTreeExpand(e.target.checked, 1)">展开/折叠</a-checkbox>
          <a-checkbox v-model:checked="deptNodeAll" @change="e => handleCheckedTreeNodeAll(e.target.checked, 1)">全选/全不选</a-checkbox>
          <div class="tree-border" style="height: 100px; overflow: auto">
            <a-tree
              v-model:checkedKeys="deptCheckedKeys"
              v-model:expandedKeys="deptExpandedKeys"
              checkable
              check-strictly
              :tree-data="deptOptions"
              :field-names="{ title: 'deptName', key: 'deptId', children: 'children' }"
            />
          </div>
        </div>
      </a-form-item>
      <a-form-item label="菜单权限">
        <div>
          <a-checkbox v-model:checked="menuExpand" @change="e => handleCheckedTreeExpand(e.target.checked, 2)">展开/折叠</a-checkbox>
          <a-checkbox v-model:checked="menuNodeAll" @change="e => handleCheckedTreeNodeAll(e.target.checked, 2)">全选/全不选</a-checkbox>
          <div class="tree-border" style="height: 100px; overflow: auto">
            <a-tree
              v-model:checkedKeys="menuCheckedKeys"
              v-model:expandedKeys="menuExpandedKeys"
              checkable
              check-strictly
              :tree-data="menuOptions"
              :field-names="{ title: 'menuName', key: 'menuId', children: 'children' }"
            />
          </div>
        </div>
      </a-form-item>
      <a-form-item label="角色顺序" name="roleSort">
        <a-input-number v-model:value="form.roleSort" :min="0" />
      </a-form-item>
      <a-form-item label="状态">
        <a-radio-group v-model:value="form.status">
          <a-radio v-for="dict in StatusEnum" :key="dict.value" :value="dict.value">{{ dict.label }}</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item label="备注">
        <a-textarea v-model:value="form.remark" placeholder="请输入内容" />
      </a-form-item>
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

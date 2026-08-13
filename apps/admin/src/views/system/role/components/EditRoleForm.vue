<script setup lang="ts">
/**
 * 角色编辑表单
 * 职责：新增/编辑角色；菜单权限为 VXE 树表「左菜单右功能」勾选（图2）
 * 适用：角色列表弹窗；提交 menuIds（M+F）；无自定义部门数据权限
 */
import { addRole, getRole, updateRole } from "@/api/system/role";
import { roleMenuTreeSelect, menuTreeSelect } from "@/api/system/menu";
import { useDict } from "@/hooks/useDict";
import type { FormInstance, Rule } from "ant-design-vue/es/form";
import type { MenuTreeVo } from "#/api/system/menu";
import type { VxeGridInstance, VxeGridProps } from "vxe-table";
import type { VxeGridBindOptions } from "#/vxe-grid";
import $feedback from "@/utils/feedback";
import { collectAllMenuIds, toMenuTableRows, type MenuTableRow } from "@/utils/menuTree";

defineOptions({
  name: "EditRoleForm"
});

const props = defineProps({
  roleId: { type: Number }
});
const $emit = defineEmits(["success", "cancel"]);

const { StatusEnum, DataScopeEnum } = toRefs(useDict("StatusEnum", "DataScopeEnum"));

/** 原始树（含 F），提交全选时用 */
const menuRawTree = ref<MenuTreeVo[]>([]);
const menuExpand = ref(true);
const menuNodeAll = ref(false);
/** 已勾选的 menuId（含 M 与 F） */
const checkedMenuIds = ref<Set<number>>(new Set());

const roleRef = ref<FormInstance>();
const menuGridRef = ref<VxeGridInstance<MenuTableRow>>();

const data = reactive({
  form: {
    roleId: undefined,
    roleName: undefined,
    roleKey: undefined,
    roleSort: 0,
    dataScope: "1",
    status: "0",
    menuIds: [] as number[],
    deptIds: [] as number[],
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

const menuGridOptions = reactive<VxeGridProps<MenuTableRow>>({
  border: true,
  height: 300,
  // 权限多选换行需动态行高
  showOverflow: false,
  scrollY: {
    enabled: false
  },
  rowConfig: {
    keyField: "menuId",
    isHover: true
  },
  treeConfig: {
    childrenField: "children",
    expandAll: true,
    indent: 0
  },
  columns: [
    {
      field: "menuName",
      title: "菜单",
      width: 220,
      treeNode: true,
      align: "left",
      showOverflow: true,
      slots: {
        default: "menu_slot"
      }
    },
    {
      field: "perms",
      title: "权限",
      showOverflow: false,
      className: "menu-perm-cell",
      slots: {
        default: "perms_slot"
      }
    }
  ],
  data: []
});

function isChecked(id: number) {
  return checkedMenuIds.value.has(id);
}

function setChecked(id: number, on: boolean) {
  const next = new Set(checkedMenuIds.value);
  if (on) next.add(id);
  else next.delete(id);
  checkedMenuIds.value = next;
}

/** 二级 M 勾选：联动其下全部 F */
function onMenuCheck(row: MenuTableRow, checked: boolean) {
  setChecked(row.menuId, checked);
  for (const p of row.perms || []) {
    setChecked(p.menuId, checked);
  }
  if (row.children?.length) {
    for (const child of row.children) {
      onMenuCheck(child, checked);
    }
  }
  syncParentChecks();
}

/** 勾 F：自动勾所属二级 M */
function onPermCheck(row: MenuTableRow, permId: number, checked: boolean) {
  setChecked(permId, checked);
  if (checked) setChecked(row.menuId, true);
  syncParentChecks();
}

/** 一级 M：根据子级刷新勾选态 */
function syncParentChecks() {
  const next = new Set(checkedMenuIds.value);
  for (const root of menuGridOptions.data || []) {
    if (!root.children?.length) continue;
    const allOn = root.children.every(c => next.has(c.menuId));
    const anyOn = root.children.some(c => next.has(c.menuId));
    if (allOn) next.add(root.menuId);
    else if (!anyOn) next.delete(root.menuId);
  }
  checkedMenuIds.value = next;
}

function parentIndeterminate(row: MenuTableRow) {
  if (!row.children?.length) return false;
  const n = row.children.filter(c => isChecked(c.menuId)).length;
  return n > 0 && n < row.children.length;
}

function applyMenuRows(rows: MenuTableRow[]) {
  menuGridOptions.data = rows;
  nextTick(() => {
    if (menuExpand.value) {
      unref(menuGridRef)?.setAllTreeExpand(true);
    } else {
      unref(menuGridRef)?.clearTreeExpand();
    }
  });
}

async function getInfo() {
  if (props.roleId) {
    const { data: role } = await getRole(props.roleId);
    for (const key of Object.keys(form.value)) {
      form.value[key] = role[key];
    }
    nextTick(() => {
      roleMenuTreeSelect(props.roleId).then(res => {
        menuRawTree.value = res.data.menus;
        applyMenuRows(toMenuTableRows(res.data.menus));
        checkedMenuIds.value = new Set(res.data.checkedIds || []);
      });
    });
  }
}

function getMenuTreeSelect() {
  menuTreeSelect().then(response => {
    menuRawTree.value = response.data;
    applyMenuRows(toMenuTableRows(response.data));
  });
}

function handleCheckedTreeExpand(checked: boolean) {
  menuExpand.value = checked;
  if (checked) unref(menuGridRef)?.setAllTreeExpand(true);
  else unref(menuGridRef)?.clearTreeExpand();
}

function handleCheckedTreeNodeAll(checked: boolean) {
  checkedMenuIds.value = new Set(checked ? collectAllMenuIds(menuRawTree.value) : []);
}

async function submitForm() {
  try {
    await unref(roleRef)?.validate();
  } catch {
    return;
  }
  form.value.deptIds = [];
  form.value.menuIds = [...checkedMenuIds.value];
  const flag = form.value.roleId != undefined;
  flag ? await updateRole(form.value) : await addRole(form.value);
  $feedback.message.success(flag ? "修改成功" : "新增成功");
  $emit("success");
  $emit("cancel");
}

getMenuTreeSelect();
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
      <a-form-item label="菜单权限">
        <div>
         <a-space class="h-[32px]">
          <a-checkbox :checked="menuExpand" @change="e => handleCheckedTreeExpand(e.target.checked)">展开/折叠</a-checkbox>
          <a-checkbox v-model:checked="menuNodeAll" @change="e => handleCheckedTreeNodeAll(e.target.checked)">全选/全不选</a-checkbox>
         </a-space>
          <div class="menu-perm-table mt-2">
            <vxe-grid ref="menuGridRef" v-bind="menuGridOptions as VxeGridBindOptions">
              <template #menu_slot="{ row }">
                <div class="menu-name-cell">
                  <!-- 仅二级显示 └ 拐角，与菜单管理一致 -->
                  <svg v-if="row.parentId !== 0" class="menu-tree-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                    <path d="M4 2v8a2 2 0 0 0 2 2h6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <a-checkbox :checked="isChecked(row.menuId)" :indeterminate="parentIndeterminate(row)" @change="e => onMenuCheck(row, e.target.checked)">
                    {{ row.menuName }}
                  </a-checkbox>
                </div>
              </template>
              <template #perms_slot="{ row }">
                <div v-if="row.perms?.length" class="menu-perm-tags" wrap>
                  <a-checkbox v-for="p in row.perms" :key="p.menuId" :checked="isChecked(p.menuId)" @change="e => onPermCheck(row, p.menuId, e.target.checked)">
                    {{ p.menuName }}
                  </a-checkbox>
                </div>
              </template>
            </vxe-grid>
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

<style scoped lang="scss">
:deep(.menu-name-cell) {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}

:deep(.menu-tree-icon) {
  flex-shrink: 0;
  margin-right: 4px;
  color: var(--color-text-secondary);
}

:deep(.menu-perm-tags) {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  line-height: 1.5;
  white-space: normal;
}

:deep(.menu-perm-cell .vxe-cell) {
  white-space: normal !important;
  max-height: none !important;
  height: auto !important;
}
</style>

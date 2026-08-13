<script setup lang="tsx">
/**
 * 菜单管理
 * 职责：两级 M 树表（菜单名称 | 权限）；F 展示在权限列；行内 CRUD
 * 主流程：拉取树 → toMenuTableRows → VXE；功能增删改仍走 EditMenuForm
 */
import { delMenu, menuTreeSelect } from "@/api/system/menu";
import type { MenuTreeVo, SysMenuListParams } from "#/api/system/menu";
import $feedback from "@/utils/feedback";
import { useDict } from "@/hooks/useDict";
import { SearchFormItem } from "@/components/FormView/type";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
import { VxeGridProps } from "vxe-table";
import type { VxeGridBindOptions } from "#/vxe-grid";
import { useTable } from "@/hooks/useVxetable";
import EditMenuForm from "./components/EditMenuForm.vue";
import { findPathFromTree } from "@llcz/common";
import { toMenuTableRows, type MenuTableRow } from "@/utils/menuTree";

defineOptions({
  name: "MenuIndex"
});

const route = useRoute();

const { StatusEnum } = toRefs(useDict("StatusEnum"));

const searchList = reactive<SearchFormItem[]>([
  {
    type: "input",
    prop: "menuName",
    label: "菜单名称"
  },
  {
    type: "select",
    prop: "status",
    label: "菜单状态",
    props: {
      options: StatusEnum.value
    }
  }
]);
const apiQuery = reactive<SysMenuListParams>({
  menuName: undefined,
  status: undefined
});

const toolbarButtons: BtnOptionsProps[] = [
  {
    btnText: "新增",
    props: {
      type: "primary"
    },
    icon: "ant-design:plus-outlined",
    authCode: "add",
    handleClick: () => {
      handleAdd(null);
    }
  },
  {
    btnText: "展开/折叠",
    props: {},
    icon: "ant-design:sort-ascending-outlined",
    handleClick: () => {
      expandAllChange();
    }
  }
];

const gridOptions = reactive<VxeGridProps<MenuTableRow>>({
  height: "auto",
  border: true,
  loading: true,
  // 权限标签多行换行需动态行高；全局 tooltip 溢出会锁死等高
  showOverflow: false,
  scrollY: {
    enabled: false
  },
  treeConfig: {
    childrenField: "children",
    indent: 0
  },
  toolbarConfig: {
    refreshOptions: {
      queryMethod: () => {
        return initListSearch();
      }
    },
    slots: {
      buttons: "toolbar_buttons"
    }
  },
  id: route.path,
  customConfig: {
    storage: true,
    checkMethod({ column }) {
      return !["menuName", "tools"].includes(column.field);
    }
  },
  columns: [
    {
      field: "menuName",
      title: "菜单名称",
      width: 200,
      align: "left",
      showOverflow: true,
      slots: {
        default({ row }) {
          // 仅二级显示层级图标，顶级不占位不画线
          const isChild = row.parentId !== 0;
          return (
            <div class="menu-name-cell">
              {isChild ? (
                <svg
                  class="menu-tree-icon"
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M4 2v8a2 2 0 0 0 2 2h6"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
              <span>{row.menuName}</span>
            </div>
          );
        }
      },
      treeNode: true
    },
    {
      field: "permText",
      title: "权限",
      showOverflow: false,
      className: "menu-perm-cell",
      slots: {
        default({ row }) {
          if (!row.perms?.length) return null;
          return (
            <div class="menu-perm-tags">
              {row.perms.map(p => (
                <a-tag
                  key={p.menuId}
                  closable
                  class="cursor-pointer"
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    handleUpdate(p as unknown as MenuTreeVo, true);
                  }}
                  onClose={(e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeletePerm(p);
                  }}
                >
                  {`${p.menuName} (${p.perm})`}
                </a-tag>
              ))}
            </div>
          );
        }
      }
    },
    {
      field: "tools",
      title: "操作",
      width: 240,
      fixed: "right",
      showOverflow: true,
      slots: {
        default: "tools_slot"
      }
    }
  ],
  data: []
});

/** 接口树压成两列展示结构 */
async function fetchMenuTable(params?: SysMenuListParams) {
  const res = await menuTreeSelect(params as any);
  return { ...res, data: toMenuTableRows(res.data as MenuTreeVo[]) };
}

const { gridRef, gridEvents, initListSearch, resetListSearch } = useTable({
  gridOptions,
  getListApi: fetchMenuTable,
  apiQuery
});

const rowButtons: BtnOptionsProps<MenuTableRow>[] = [
  {
    btnText: "修改",
    props: {
      type: "primary"
    },
    icon: "ant-design:edit-outlined",
    authCode: "edit",
    handleClick: ({ row }) => {
      handleUpdate(row, false);
    }
  },
  {
    btnText: "功能",
    props: {},
    icon: "ant-design:aim-outlined",
    authCode: "add",
    visible: ({ row }) => {
      return row.menuType === "M" && row.parentId !== 0;
    },
    handleClick: ({ row }) => {
      handleAdd(row, true);
    }
  },
  {
    btnText: "子级",
    props: {},
    icon: "ant-design:plus-outlined",
    authCode: "add",
    visible: ({ row }) => {
      return row.menuType === "M" && row.parentId === 0;
    },
    handleClick: ({ row }) => {
      handleAdd(row);
    }
  },
  {
    btnText: "删除",
    props: {
      type: "primary",
      danger: true
    },
    icon: "ant-design:delete-outlined",
    authCode: "remove",
    handleClick: ({ row }) => {
      handleDelete(row);
    }
  }
];

initListSearch();

function handleReset() {
  resetListSearch();
}

const expandAll = ref(false);
function expandAllChange() {
  expandAll.value = !expandAll.value;
  unref(expandAll) && unref(gridRef).setAllTreeExpand(true);
  !unref(expandAll) && unref(gridRef).clearTreeExpand();
}

function handleDelete(row: MenuTableRow | MenuTreeVo) {
  $feedback
    .confirm('是否确认删除名称为"' + row.menuName + '"的数据项?')
    .then(function () {
      return delMenu(row.menuId);
    })
    .then(() => {
      initListSearch();
      $feedback.message.success("删除成功");
    })
    .catch(() => {});
}

/** 权限列标签关闭：删 F */
function handleDeletePerm(p: { menuId: number; menuName: string }) {
  handleDelete(p as MenuTreeVo);
}

const editDialog = reactive({
  open: false,
  title: "",
  menuId: undefined as number | undefined,
  parentId: undefined as number | undefined,
  parentName: "",
  isPerm: false
});

function handleAdd(row: MenuTableRow | null, isPerm = false) {
  editDialog.menuId = undefined;
  editDialog.parentId = row ? row.menuId : 0;
  editDialog.parentName = row
    ? findPathFromTree(gridOptions.data, c => c.menuName === row.menuName)
        .map(c => c.menuName)
        .join(">")
    : "";
  editDialog.isPerm = isPerm;
  editDialog.title = !isPerm ? "添加菜单" : "添加功能";
  editDialog.open = true;
}

function handleUpdate(row: MenuTreeVo | MenuTableRow | { menuId: number }, isPerm = false) {
  editDialog.menuId = row.menuId;
  editDialog.isPerm = isPerm;
  editDialog.title = !isPerm ? "修改菜单" : "修改功能";
  editDialog.open = true;
}
</script>

<template>
  <div class="app-page cz-card">
    <vxe-grid ref="gridRef" v-bind="gridOptions as VxeGridBindOptions" v-on="gridEvents">
      <template #form>
        <SearchForm v-model="apiQuery" :columns="searchList" @search="initListSearch" @reset="handleReset" />
      </template>
      <template #toolbar_buttons>
        <ToolButtons :buttons="toolbarButtons" size="middle" />
      </template>
      <template #tools_slot="data">
        <ToolButtons :buttons="rowButtons" :data="data" />
      </template>
    </vxe-grid>

    <a-modal v-model:open="editDialog.open" :title="editDialog.title" :width="editDialog.isPerm ? '600px' : '800px'" :footer="null" destroy-on-close>
      <EditMenuForm
        v-if="editDialog.open"
        :menuId="editDialog.menuId"
        :parentId="editDialog.parentId"
        :parentName="editDialog.parentName"
        :isPerm="editDialog.isPerm"
        @success="initListSearch"
        @cancel="editDialog.open = false"
      />
    </a-modal>
  </div>
</template>

<style scoped lang="scss">
/* JSX/VXE 插槽节点无 data-v，用 :deep 打到表格内部后代 */
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

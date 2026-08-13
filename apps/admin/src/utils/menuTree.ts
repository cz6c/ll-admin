/**
 * 菜单树展示变换
 * 职责：将 F 节点收成父级 M 的权限列表，供菜单管理 / 角色勾选表使用
 * 适用：仅两级 M；F 不作为树行展示
 */
import type { MenuTreeVo } from "#/api/system/menu";

/** 功能权限展示项 */
export type MenuPermItem = {
  menuId: number;
  menuName: string;
  perm: string;
};

/** 菜单管理 / 角色表用行：仅 M，附带 perms */
export type MenuTableRow = Omit<MenuTreeVo, "children"> & {
  children?: MenuTableRow[];
  /** 本行挂载的 F */
  perms: MenuPermItem[];
  /** 权限列文案：`新增 (add)、编辑 (edit)` */
  permText: string;
};

/**
 * 把后端菜单树压成「仅 M + 行内 perms」
 * @param nodes menuTreeSelect 原始树
 */
export function toMenuTableRows(nodes: MenuTreeVo[] | undefined | null): MenuTableRow[] {
  return (nodes || [])
    .filter(n => n.menuType === "M")
    .map(n => {
      const kids = n.children || [];
      const perms: MenuPermItem[] = kids
        .filter(c => c.menuType === "F")
        .map(c => ({ menuId: c.menuId, menuName: c.menuName, perm: c.perm }));
      const menuChildren = toMenuTableRows(kids.filter(c => c.menuType === "M"));
      return {
        ...n,
        children: menuChildren.length ? menuChildren : undefined,
        perms,
        permText: perms.map(p => `${p.menuName} (${p.perm})`).join("、")
      };
    });
}

/**
 * 收集树中全部 menuId（含 F），用于角色全选
 */
export function collectAllMenuIds(nodes: MenuTreeVo[] | undefined | null): number[] {
  const ids: number[] = [];
  const walk = (list: MenuTreeVo[]) => {
    for (const n of list || []) {
      ids.push(n.menuId);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes || []);
  return ids;
}

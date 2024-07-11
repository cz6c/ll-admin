// 详情
export interface CategoryItem {
  id: string;
  /** 分类名称 */
  name: string;

  /** 父级分类id */
  parentId: string;

  children: CategoryItem[];
}

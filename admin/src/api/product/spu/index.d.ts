import type { ListParams, ListResponse } from "#/api/index.d";
// 详情
export interface ProductItem {
  id: string;

  /** 商品名称 */
  name: string;

  /** 商品编码 */
  spuCode: string;

  /** 商品描述 */
  desc: string;

  /** 当前价格 */
  price: number;

  /** 主图图片集合[ 主图图片链接 ] */
  mainPictures: string[];

  /** 商品详情图片集合[ 图片链接 ] */
  pictures: string[];

  /** 一对多sku */
  skus: SkuItem[];

  /** 多对多规格 */
  specs: SpecificationItem[];

  /** 多对一分类 */
  categoryId: string;
  categoryName: string;

  status: boolean;

  createTime: string;
}

// 列表
export type ProductListResponse = ListResponse<ProductItem>;
export interface ProductListParams extends ListParams {
  userName?: string;
}

export interface SkuItem {
  id: string;

  /** sku名称 */
  skuName: string;

  /** 库存 */
  inventory: number;

  /** 当前价格 */
  price: number;

  /** sku图片 */
  picture: string;

  /** sku编码 */
  skuCode: string;

  /** 规格集合[ 规格信息 ] */
  specVals: string[];
}

export type SpecificationItem = {
  id: string;

  /** 规格名称 */
  name: string;

  /** 规格值数组 */
  options: string[];
};

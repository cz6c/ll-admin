import type { GetListParams, GetListResponse } from "@/api/public/index.d";
// 详情
export interface OrderItem {
  id: string;
  createTime: string;
  updateTime: string;
  /** 订单编号 */
  orderNo: string;

  /** 订单状态，1为待付款、2为待发货、3为待收货、4为待评价、5为已完成、6为已取消 */
  orderState: OrderState;

  /** 倒计时--剩余的秒数 -1 表示已经超时，正数表示倒计时未结束 */
  countdown: number;

  /** 收货人 */
  receiver: string;

  /** 收货人手机 */
  receiverMobile: string;

  /** 收货人完整地址 */
  receiverAddress: string;

  /** 商品总价 */
  totalMoney: number;

  /** 运费 */
  postFee: number;

  /** 应付金额 */
  payMoney: number;

  /** 订单备注 */
  buyerMessage: string;

  /** 支付渠道：支付渠道，1支付宝、2微信 */
  payChannel: PayChannel;

  /** 一对多 */
  orderSkus: OrderSkuEntity[];
}

export interface OrderSkuEntity {
  /** 商品 id */
  spuId: string;

  /** 商品名称 */
  name: string;

  /** 数量 */
  quantity: number;

  /** 购买时单价 */
  curPrice: number;

  /** sku图片 */
  picture: string;
}

// 列表
export type OrderListResponse = GetListResponse<OrderItem>;
export interface OrderListParams extends GetListParams {
  username?: string;
}

/** 订单状态枚举 */
export enum OrderState {
  /** 待付款 */
  待付款 = 1,
  /** 待发货 */
  待发货 = 2,
  /** 待收货 */
  待收货 = 3,
  /** 待评价 */
  待评价 = 4,
  /** 已完成 */
  已完成 = 5,
  /** 已取消 */
  已取消 = 6
}

/** 订单状态枚举 */
export enum PayChannel {
  /** 支付宝 */
  支付宝 = 1,
  /** 微信 */
  微信 = 2
}

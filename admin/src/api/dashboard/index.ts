import { createGet } from "@/utils/request";
import type { ParamsLoginLogList, ResponseLoginLogList } from "./index.d";

// 获取当前用户菜单
export const getLoginLog = createGet<ParamsLoginLogList, ResponseLoginLogList>("/admin/loginLogList");

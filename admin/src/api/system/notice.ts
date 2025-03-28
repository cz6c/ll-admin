import { $http } from "@/utils/request";
import type { ListNoticeDto, SysNoticeListResponse, SysNoticeVo, UpdateNoticeDto } from "#/api/system/notice";

// 查询公告列表
export function listNotice(params: ListNoticeDto) {
  return $http<never, SysNoticeListResponse>({
    url: "/system/notice/list",
    method: "get",
    params
  });
}

// 查询公告详细
export function getNotice(noticeId: number) {
  return $http<never, SysNoticeVo>({
    url: "/system/notice/" + noticeId,
    method: "get"
  });
}

// 新增公告
export function addNotice(data: UpdateNoticeDto) {
  return $http<UpdateNoticeDto, never>({
    url: "/system/notice/create",
    method: "post",
    data
  });
}

// 修改公告
export function updateNotice(data: UpdateNoticeDto) {
  return $http<UpdateNoticeDto, never>({
    url: "/system/notice/update",
    method: "post",
    data
  });
}

// 删除公告
export function delNotice(noticeIds: string) {
  return $http({
    url: "/system/notice/delete/" + noticeIds,
    method: "get"
  });
}

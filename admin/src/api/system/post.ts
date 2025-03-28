import { $http } from "@/utils/request";
import type { ListPostDto, UpdatePostDto, SysPostListResponse, SysPostVo } from "#/api/system/post";

// 查询岗位列表
export function listPost(params: ListPostDto) {
  return $http<never, SysPostListResponse>({
    url: "/system/post/list",
    method: "get",
    params
  });
}

// 查询岗位详细
export function getPost(postId: number) {
  return $http<never, SysPostVo>({
    url: "/system/post/" + postId,
    method: "get"
  });
}

// 新增岗位
export function addPost(data: UpdatePostDto) {
  return $http<UpdatePostDto, never>({
    url: "/system/post/create",
    method: "post",
    data
  });
}

// 修改岗位
export function updatePost(data: UpdatePostDto) {
  return $http<UpdatePostDto, never>({
    url: "/system/post/update",
    method: "post",
    data: data
  });
}

// 删除岗位
export function delPost(postIds: string) {
  return $http({
    url: "/system/post/delete/" + postIds,
    method: "get"
  });
}

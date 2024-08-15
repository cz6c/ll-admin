const Layout = () => import("@/layout/index.vue");

// 动态路由，基于用户权限动态去加载
export const dynamicRoutes = [
  {
    path: "/system/user-auth",
    component: Layout,
    hidden: true,
    permissions: ["system:user:edit"],
    children: [
      {
        path: "role/:userId(\\d+)",
        component: () => import("@/views/system/user/authRole.vue"),
        name: "AuthRole",
        meta: { title: "分配角色", activeMenu: "/system/user" }
      }
    ]
  },
  {
    path: "/system/role-auth",
    component: Layout,
    hidden: true,
    permissions: ["system:role:edit"],
    children: [
      {
        path: "user/:roleId(\\d+)",
        component: () => import("@/views/system/role/authUser.vue"),
        name: "AuthUser",
        meta: { title: "分配用户", activeMenu: "/system/role" }
      }
    ]
  },
  {
    path: "/system/dict-data",
    component: Layout,
    hidden: true,
    permissions: ["system:dict:list"],
    children: [
      {
        path: "index/:dictId(\\d+)",
        component: () => import("@/views/system/dict/data.vue"),
        name: "Data",
        meta: { title: "字典数据", activeMenu: "/system/dict" }
      }
    ]
  }
];

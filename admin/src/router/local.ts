import type { AppRouteRecordRaw } from "#/utils";

export default [
  {
    name: "System",
    path: "/system",
    hidden: false,
    component: "Layout",
    meta: {
      title: "系统管理",
      icon: "system",
      noCache: false,
      link: null
    },
    alwaysShow: true,
    redirect: "noRedirect",
    children: [
      {
        name: "User",
        path: "/system/user",
        hidden: false,
        component: "system/user/index",
        meta: {
          title: "用户管理",
          icon: "user",
          noCache: false,
          link: null
        }
      },
      {
        hidden: true,
        path: "/system/user/authRole",
        component: "system/user/authRole",
        name: "AuthRole",
        meta: { title: "分配角色", activeMenu: "/system/user" }
      },
      {
        name: "Role",
        path: "/system/role",
        hidden: false,
        component: "system/role/index",
        meta: {
          title: "角色管理",
          icon: "peoples",
          noCache: false,
          link: null
        }
      },
      {
        hidden: true,
        path: "/system/role/authUser",
        component: "system/role/authUser",
        name: "AuthUser",
        meta: { title: "分配用户", activeMenu: "/system/role" }
      },
      {
        name: "Menu",
        path: "/system/menu",
        hidden: false,
        component: "system/menu/index",
        meta: {
          title: "菜单管理",
          icon: "tree-table",
          noCache: false,
          link: null
        }
      },
      {
        name: "Dept",
        path: "/system/dept",
        hidden: false,
        component: "system/dept/index",
        meta: {
          title: "部门管理",
          icon: "tree",
          noCache: false,
          link: null
        }
      },
      {
        name: "Post",
        path: "/system/post",
        hidden: false,
        component: "system/post/index",
        meta: {
          title: "岗位管理",
          icon: "post",
          noCache: false,
          link: null
        }
      },
      {
        name: "Dict",
        path: "/system/dict",
        hidden: false,
        component: "system/dict/index",
        meta: {
          title: "字典管理",
          icon: "dict",
          noCache: false,
          link: null
        }
      },
      {
        hidden: true,
        path: "/system/dict/data",
        component: () => "system/dict/data",
        name: "Data",
        meta: { title: "字典数据", activeMenu: "/system/dict" }
      },
      {
        name: "Config",
        path: "/system/config",
        hidden: false,
        component: "system/config/index",
        meta: {
          title: "参数设置",
          icon: "edit",
          noCache: false,
          link: null
        }
      },
      {
        name: "Notice",
        path: "/system/notice",
        hidden: false,
        component: "system/notice/index",
        meta: {
          title: "通知公告",
          icon: "message",
          noCache: false,
          link: null
        }
      }
    ]
  },
  {
    name: "Monitor",
    path: "/monitor",
    hidden: false,
    component: "Layout",
    meta: {
      title: "系统监控",
      icon: "monitor",
      noCache: false,
      link: null
    },
    alwaysShow: true,
    redirect: "noRedirect",
    children: [
      {
        name: "Online",
        path: "/monitor/online",
        hidden: false,
        component: "monitor/online/index",
        meta: {
          title: "在线用户",
          icon: "online",
          noCache: false,
          link: null
        }
      },
      {
        name: "Server",
        path: "/monitor/server",
        hidden: false,
        component: "monitor/server/index",
        meta: {
          title: "服务监控",
          icon: "server",
          noCache: false,
          link: null
        }
      },
      {
        name: "Cache",
        path: "/monitor/cache",
        hidden: false,
        component: "monitor/cache/index",
        meta: {
          title: "缓存监控",
          icon: "redis",
          noCache: false,
          link: null
        }
      },
      {
        name: "CacheList",
        path: "/monitor/cacheList",
        hidden: false,
        component: "monitor/cache/list",
        meta: {
          title: "缓存列表",
          icon: "redis-list",
          noCache: false,
          link: null
        }
      }
    ]
  },
  {
    name: "Https://nest-admin.dooring.vip",
    path: "https://nest-admin.dooring.vip",
    hidden: false,
    component: "Layout",
    meta: {
      title: "nest-admin官网",
      icon: "guide",
      noCache: false,
      link: "https://nest-admin.dooring.vip"
    }
  }
] as AppRouteRecordRaw[];

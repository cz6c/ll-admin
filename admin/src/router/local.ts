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
      link: null,
      activeMenu: "",
      perms: []
    },
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
          link: null,
          activeMenu: ""
        }
      },
      {
        name: "Profile",
        path: "/user/profile",
        hidden: true,
        component: "system/user/profile/index",
        meta: {
          title: "角色管理",
          icon: "#",
          noCache: false,
          link: null,
          activeMenu: ""
        }
      },
      {
        name: "Role",
        path: "/system/role",
        hidden: false,
        component: "system/role/index",
        meta: {
          title: "菜单管理",
          icon: "peoples",
          noCache: false,
          link: null,
          activeMenu: ""
        }
      },
      {
        name: "Menu",
        path: "/system/menu",
        hidden: false,
        component: "system/menu/index",
        meta: {
          title: "部门管理",
          icon: "tree-table",
          noCache: false,
          link: null,
          activeMenu: ""
        }
      },
      {
        name: "Dept",
        path: "/system/dept",
        hidden: false,
        component: "system/dept/index",
        meta: {
          title: "岗位管理",
          icon: "tree",
          noCache: false,
          link: null,
          activeMenu: ""
        }
      },
      {
        name: "Post",
        path: "/system/post",
        hidden: false,
        component: "system/post/index",
        meta: {
          title: "字典管理",
          icon: "post",
          noCache: false,
          link: null,
          activeMenu: ""
        }
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
          link: null,
          activeMenu: ""
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
          link: null,
          activeMenu: ""
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
      link: null,
      activeMenu: "",
      perms: []
    },
    redirect: "noRedirect",
    children: [
      {
        name: "Server",
        path: "/monitor/server",
        hidden: false,
        component: "monitor/server/index",
        meta: {
          title: "服务监控",
          icon: "server",
          noCache: false,
          link: null,
          activeMenu: ""
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
          link: null,
          activeMenu: ""
        }
      },
      {
        name: "Cachelist",
        path: "/monitor/cacheList",
        hidden: false,
        component: "monitor/cache/list",
        meta: {
          title: "缓存列表",
          icon: "redis-list",
          noCache: false,
          link: null,
          activeMenu: ""
        }
      },
      {
        name: "Logininfor",
        path: "/monitor/logininfor",
        hidden: false,
        component: "monitor/logininfor/index",
        meta: {
          title: "登录日志",
          icon: "logininfor",
          noCache: false,
          link: null,
          activeMenu: ""
        }
      }
    ]
  },
  {
    name: "Chart",
    path: "/chart",
    hidden: false,
    component: "Layout",
    meta: {
      title: "图表",
      icon: "chart",
      noCache: false,
      link: null,
      activeMenu: "",
      perms: []
    },
    redirect: "noRedirect",
    children: [
      {
        name: "AMap",
        path: "/charts/aMap",
        hidden: false,
        component: "charts/aMap/index",
        meta: {
          title: "高德地图",
          icon: "guide",
          noCache: false,
          link: null,
          activeMenu: ""
        }
      },
      {
        name: "EchartsMap",
        path: "/charts/map",
        hidden: false,
        component: "charts/map/index",
        meta: {
          title: "Echarts地图",
          icon: "dashboard",
          noCache: false,
          link: null,
          activeMenu: ""
        }
      }
    ]
  },
  {
    name: "",
    path: "https://cn.vuejs.org",
    hidden: false,
    component: "Layout",
    meta: {
      title: "vue官网",
      icon: "guide",
      noCache: false,
      link: "https://cn.vuejs.org",
      activeMenu: ""
    }
  }
];

/**
 * 本地侧栏菜单（Web / CS 均可）
 * 与 getRouters 按 path 去重后合并；工作日报不走侧栏，见 Navbar 操作栏
 * 系统监控 / 外部文档：非业务权限树，固定写死本地，不再走 sys_menu
 */
export default [
  {
    name: "Monitor",
    path: "/monitor",
    hidden: false,
    component: "Layout",
    meta: {
      title: "系统监控",
      icon: "ant-design:desktop-outlined",
      noCache: false,
      link: null,
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
          icon: "ant-design:dashboard-outlined",
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
          title: "缓存管理",
          icon: "ant-design:database-outlined",
          noCache: false,
          link: null
        }
      }
    ]
  },
  {
    name: "Iframe",
    path: "/iframe",
    hidden: false,
    component: "Layout",
    meta: {
      title: "外部文档",
      icon: "ant-design:link-outlined",
      noCache: false,
      link: null,
      perms: []
    },
    redirect: "noRedirect",
    children: [
      // path 与后端 getRouterPath 一致：外链用域名作路由，真实地址放 meta.link
      {
        name: "ElementPlus",
        path: "/element-plus.org",
        hidden: false,
        component: "IFrame",
        meta: {
          title: "Element Plus",
          icon: "ant-design:link-outlined",
          noCache: false,
          link: "https://element-plus.org/zh-CN/"
        }
      },
      {
        name: "AntDesignVue",
        path: "/antdv.com",
        hidden: false,
        component: "IFrame",
        meta: {
          title: "Ant Design Vue",
          icon: "ant-design:link-outlined",
          noCache: false,
          link: "https://antdv.com/components/overview-cn/"
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
      icon: "ant-design:bar-chart-outlined",
      noCache: false,
      link: null,
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
          icon: "",
          noCache: false,
          link: null
        }
      },
      {
        name: "EchartsMap",
        path: "/charts/map",
        hidden: false,
        component: "charts/map/index",
        meta: {
          title: "Echarts地图",
          icon: "",
          noCache: false,
          link: null
        }
      }
    ]
  }
];

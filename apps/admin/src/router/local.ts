export default [
  {
    name: "Chart",
    path: "/chart",
    hidden: false,
    component: "Layout",
    meta: {
      title: "图表",
      icon: "ri:bar-chart-box-line",
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
          icon: "",
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
          icon: "",
          noCache: false,
          link: null,
          activeMenu: ""
        }
      }
    ]
  }
];

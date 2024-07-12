import auth from "@/utils/router";
import { constantRoutes, Layout, IFrame, ParentView } from "@/router";
import { getRouters } from "@/api/public";
import { isArray } from "@/utils/is";

// 匹配views里面所有的.vue文件
const modules = import.meta.glob("./../../views/**/*.vue");

export const usePermissionStore = defineStore("permission", {
  state: () => ({
    routes: [],
    addRoutes: [],
    defaultRoutes: [],
    topbarRouters: [],
    sidebarRouters: [],
  }),
  actions: {
    setRoutes(routes) {
      this.addRoutes = routes;
      this.routes = constantRoutes.concat(routes);
    },
    setDefaultRoutes(routes) {
      this.defaultRoutes = constantRoutes.concat(routes);
    },
    setTopbarRoutes(routes) {
      this.topbarRouters = routes;
    },
    setSidebarRouters(routes) {
      this.sidebarRouters = routes;
    },
    generateRoutes() {
      return new Promise(resolve => {
        // 向后端请求路由数据
        getRouters().then(res => {
          const sdata = JSON.parse(JSON.stringify(res.data));
          const rdata = JSON.parse(JSON.stringify(res.data));
          // const defaultData = JSON.parse(JSON.stringify(res.data));
          // const sidebarRoutes = filterAsyncRouter(sdata);
          const rewriteRoutes = filterAsyncRouter(rdata, false, true);
          console.log("🚀 ~ getRouters ~ rewriteRoutes:", rewriteRoutes);
          // const defaultRoutes = filterAsyncRouter(defaultData);
          // const asyncRoutes = filterDynamicRoutes(dynamicRoutes);
          // asyncRoutes.forEach(route => {
          //   router.addRoute(route);
          // });
          this.setRoutes(rewriteRoutes);
          // this.setSidebarRouters(constantRoutes.concat(sidebarRoutes));
          // this.setDefaultRoutes(sidebarRoutes);
          // this.setTopbarRoutes(defaultRoutes);
          resolve(rewriteRoutes);
        });
      });
    },
  },
});

// 遍历后台传来的路由字符串，转换为组件对象
function filterAsyncRouter(asyncRouterMap, lastRouter = false, type = false) {
  return asyncRouterMap.filter(route => {
    // if (type && route.children) {
    //   route.children = filterChildren(route.children, null);
    // }
    if (route.component) {
      // Layout ParentView 组件特殊处理
      if (route.component === "Layout") {
        route.component = Layout;
      } else if (route.component === "ParentView") {
        route.component = ParentView;
      } else if (route.component === "InnerLink") {
        route.component = IFrame;
      } else {
        route.component = loadView(route.component);
      }
    }
    if (isArray(route.children) && route.children.length) {
      route.children = filterAsyncRouter(route.children, route, type);
    } else {
      delete route["children"];
      delete route["redirect"];
    }
    return true;
  });
}

function filterChildren(childrenMap, lastRouter) {
  var children = [];
  childrenMap.forEach((el, index) => {
    if (el.children && el.children.length) {
      if (el.component === "ParentView" && !lastRouter) {
        el.children.forEach(c => {
          c.path = el.path + "/" + c.path;
          if (c.children && c.children.length) {
            children = children.concat(filterChildren(c.children, c));
            return;
          }
          children.push(c);
        });
        return;
      }
    }
    if (!!lastRouter) {
      el.path = lastRouter.path + "/" + el.path;
    }
    children = children.concat(el);
  });
  return children;
}

// 动态路由遍历，验证是否具备权限
// export function filterDynamicRoutes(routes) {
//   const res = [];
//   routes.forEach(route => {
//     if (route.permissions) {
//       if (auth.hasPermiOr(route.permissions)) {
//         res.push(route);
//       }
//     } else if (route.roles) {
//       if (auth.hasRoleOr(route.roles)) {
//         res.push(route);
//       }
//     }
//   });
//   return res;
// }

const loadView = view => {
  let res;
  console.log("🚀 ~ loadView ~ modules:", modules)
  for (const path in modules) {
    const dir = path.split("views/")[1].split(".vue")[0];
    console.log("🚀 ~ loadView ~ dir:", dir)
    console.log("🚀 ~ loadView ~ view:", view)
    if (dir === view) {
      res = () => modules[path]();
    }
  }
  return res;
};

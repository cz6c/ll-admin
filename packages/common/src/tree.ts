interface TreeHelperConfig {
  id: string;
  children: string;
  pid: string;
}

// 默认配置
const DEFAULT_CONFIG: TreeHelperConfig = {
  id: "id",
  children: "children",
  pid: "parentId",
};

// 获取配置。  Object.assign 从一个或多个源对象复制到目标对象
const getConfig = (config: Partial<TreeHelperConfig>) => Object.assign({}, DEFAULT_CONFIG, config);

/**
 * @description: 数组转树
 * @param list 数组
 * @param config 树节点属性配置
 * @return 树
 */
export function listToTree(list: any[], config: Partial<TreeHelperConfig> = {}): any[] {
  const conf = getConfig(config) as TreeHelperConfig;
  const nodeMap = new Map();
  const result: any[] = [];
  const { id, children, pid } = conf;

  for (const node of list) {
    node[children] = node[children] || [];
    nodeMap.set(node[id], node);
  }
  for (const node of list) {
    const parent = nodeMap.get(node[pid]);
    (parent ? parent[children] : result).push(node);
  }
  return result;
}

/**
 * @description: 树转数组
 * @param tree 树
 * @param config 树节点属性配置
 * @return 数组
 */
export function treeToList(tree: any[], config: Partial<TreeHelperConfig> = {}): any[] {
  config = getConfig(config);
  const { children } = config;
  const result = [...tree];
  for (let i = 0; i < result.length; i++) {
    if (!result[i][children!]) continue;
    result.splice(i + 1, 0, ...result[i][children!]);
  }
  return result;
}

/**
 * @description: 查找树节点
 * @param tree 树
 * @param callBack 回调
 * @param config 树节点属性配置
 * @return 树节点
 */
export function findNode(
  tree: any[],
  callBack: (n: any) => boolean,
  config: Partial<TreeHelperConfig> = {}
): any | null {
  config = getConfig(config);
  const { children } = config;
  const list = [...tree];
  for (const node of list) {
    if (callBack(node)) return node;
    node[children!] && list.push(...node[children!]);
  }
  return null;
}

/**
 * @description: 过滤树结构
 * @param tree 树
 * @param callBack 回调 过滤节点处理
 * @param config 树节点属性配置
 * @return 树
 */
export function filterTree(tree: any[], callBack: (n: any) => boolean, config: Partial<TreeHelperConfig> = {}): any[] {
  config = getConfig(config);
  const { children } = config;
  function listFilter(list: any[]) {
    return list
      .map((node: any) => ({ ...node }))
      .filter((node) => {
        // 递归调用 对含有children项  进行再次调用自身函数 listFilter
        node[children] = node[children] && listFilter(node[children]);
        // 执行传入的回调 callBack 进行过滤
        // 如果没有通过 callBack 的检查，但节点有子节点，并且至少有一个子节点通过了过滤，则当前节点也会被保留，因为它至少有一个有效的子节点。
        return callBack(node) || (node[children] && node[children].length);
      });
  }
  return listFilter(tree);
}

/**
 * @description: 深度遍历树结构
 * @param tree 树
 * @param callBack 回调 用于判断何时终止遍历，返回true就终止,避免大量节点场景下无意义循环，引起浏览器卡顿
 * @param config 树节点属性配置
 */
export function forEachTree(tree: any[], callBack: (n: any) => any, config: Partial<TreeHelperConfig> = {}) {
  config = getConfig(config);
  const list = [...tree];
  const { children } = config;
  for (let i = 0; i < list.length; i++) {
    if (callBack(list[i])) {
      return;
    }
    children && list[i][children] && list.splice(i + 1, 0, ...list[i][children]);
  }
}

/**
 * @description: 提取树指定结构
 * @param tree 树
 * @param conversion 提取方法
 * @param config 树节点属性配置
 * @return 树
 */
export function treeMap(tree: any[], conversion: (n: any) => any, config: Partial<TreeHelperConfig> = {}): any[] {
  config = getConfig(config);
  const { children } = config;
  function treeMapEach(data: any, conversion: (n: any) => any, children: string) {
    const haveChildren = Array.isArray(data[children]) && data[children].length > 0;
    const conversionData = conversion(data) || {};
    if (haveChildren) {
      return {
        ...conversionData,
        [children]: data[children].map((i: number) => treeMapEach(i, conversion, children)),
      };
    } else {
      return {
        ...conversionData,
      };
    }
  }
  return tree.map((item) => treeMapEach(item, conversion, children));
}

/**
 * @description: 在树结构中查找树某个节点在树中的全路径
 * @param tree 树
 * @param callBack 回调 用于判断节点是否符合条件，返回true就终止遍历,代表已找到
 * @param config 树节点属性配置
 * @return 节点全路径数组（第一个满足条件）
 */
export function findPath(tree: any[], callBack: (n: any) => any, config: Partial<TreeHelperConfig> = {}): any[] | null {
  config = getConfig(config);
  const path = [];
  const list = [...tree];
  const visitedSet = new Set();
  const { children } = config;
  while (list.length) {
    const node = list[0];
    if (visitedSet.has(node)) {
      path.pop();
      list.shift();
    } else {
      visitedSet.add(node);
      node[children!] && list.unshift(...node[children!]);
      path.push(node);
      if (callBack(node)) {
        return path;
      }
    }
  }
  return null;
}

/**
 * @description: 在树结构中查找所有满足特定条件的全路径
 * @param tree 树
 * @param callBack 回调，用于判断当前节点是否符合条件
 * @param config 树节点属性配置
 * @return [节点全路径数组]（所有满足条件,二维数组）
 */
export function findPathAll(tree: any, callBack: (n: any) => any, config: Partial<TreeHelperConfig> = {}) {
  config = getConfig(config);
  const path = [];
  const list = [...tree];
  const result = [];
  const visitedSet = new Set(),
    { children } = config;
  while (list.length) {
    const node = list[0];
    if (visitedSet.has(node)) {
      path.pop();
      list.shift();
    } else {
      visitedSet.add(node);
      node[children!] && list.unshift(...node[children!]);
      path.push(node);
      callBack(node) && result.push([...path]);
    }
  }
  return result;
}

/**
 * @description: 递归遍历树结构
 * @param tree 树
 * @param callBack 回调 用于节点处理
 * @param parentNode 父节点
 */
export function eachTree(tree: any[], callBack: (n: any, p: any) => any, parentNode: any = {}) {
  tree.forEach((element) => {
    const newNode = callBack(element, parentNode) || element;
    if (element.children) {
      eachTree(element.children, callBack, newNode);
    }
  });
}

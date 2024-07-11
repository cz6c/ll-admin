/* eslint-disable @typescript-eslint/ban-types */
interface TreeHelperConfig {
  id: string;
  children: string;
  pid: string;
}

// 默认配置
const DEFAULT_CONFIG: TreeHelperConfig = {
  id: 'id',
  children: 'children',
  pid: 'pid',
};

// 获取配置。  Object.assign 从一个或多个源对象复制到目标对象
const getConfig = (config: Partial<TreeHelperConfig>) =>
  Object.assign({}, DEFAULT_CONFIG, config);

/**
 * @description: 数组转树
 * @param {any[]} list
 * @param {Partial} config 树节点属性配置
 * @return {*}
 */
export function listToTree(
  list: any[],
  config: Partial<TreeHelperConfig> = {},
): any[] {
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
 * @param {any[]} tree 树
 * @param {Partial} config 树节点属性配置
 * @return {*}
 */
export function treeToList(
  tree: any[],
  config: Partial<TreeHelperConfig> = {},
): any[] {
  config = getConfig(config);
  const { children } = config;
  const result: any[] = [...tree];
  for (let i = 0; i < result.length; i++) {
    if (!result[i][children!]) continue;
    result.splice(i + 1, 0, ...result[i][children!]);
  }
  return result;
}

/**
 * @description: 查找树节点
 * @param {any[]} tree 树
 * @param {Function} callBack 回调
 * @param {Partial} config 树节点属性配置
 * @return {*}
 */
export function findNode(
  tree: any[],
  callBack: Function,
  config: Partial<TreeHelperConfig> = {},
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
 * @param {any[]} tree 树
 * @param {function} callBack 回调 过滤节点处理
 * @param {Partial} config 树节点属性配置
 * @return {*}
 */
export function filterTree(
  tree: any[],
  callBack: (n: any) => boolean,
  config: Partial<TreeHelperConfig> = {},
): any[] {
  // 获取配置
  config = getConfig(config);
  const children = config.children as string;
  function listFilter(list: any[]) {
    return list
      .map((node: any) => ({ ...node }))
      .filter((node) => {
        // 递归调用 对含有children项  进行再次调用自身函数 listFilter
        node[children] = node[children] && listFilter(node[children]);
        // 执行传入的回调 callBack 进行过滤
        return callBack(node) || (node[children] && node[children].length);
      });
  }
  return listFilter(tree);
}

/**
 * @description: 深度遍历树结构
 * @param {any[]} tree 树
 * @param {function} callBack 回调 返回true就终止遍历,避免大量节点场景下无意义循环，引起浏览器卡顿
 * @param {Partial} config 树节点属性配置
 */
export function forEachTree(
  tree: any[],
  callBack: (n: any) => any,
  config: Partial<TreeHelperConfig> = {},
) {
  config = getConfig(config);
  const list: any[] = [...tree];
  const { children } = config;
  for (let i = 0; i < list.length; i++) {
    if (callBack(list[i])) {
      return;
    }
    children &&
      list[i][children] &&
      list.splice(i + 1, 0, ...list[i][children]);
  }
}

/**
 * @description: 递归遍历树结构
 * @param {any[]} tree 树
 * @param {Function} callBack 回调
 * @param {*} parentNode 父节点
 */
export function eachTree(
  tree: any[],
  callBack: Function,
  parentNode: any = {},
) {
  tree.forEach((element) => {
    const newNode = callBack(element, parentNode) || element;
    if (element.children) {
      eachTree(element.children, callBack, newNode);
    }
  });
}

/**
 * @description: 提取树指定结构
 * @param {any[]} tree
 * @param {object} opt
 * @return {*}
 */
export function treeMap(
  tree: any[],
  opt: { children?: string; conversion: Function },
): any[] {
  function treeMapEach(
    data: any,
    {
      children = 'children',
      conversion,
    }: { children?: string; conversion: Function },
  ) {
    const haveChildren =
      Array.isArray(data[children]) && data[children].length > 0;
    const conversionData = conversion(data) || {};
    if (haveChildren) {
      return {
        ...conversionData,
        [children]: data[children].map((i: number) =>
          treeMapEach(i, {
            children,
            conversion,
          }),
        ),
      };
    } else {
      return {
        ...conversionData,
      };
    }
  }
  return tree.map((item) => treeMapEach(item, opt));
}

export function findPath<T = any>(
  tree: any,
  func: Function,
  config: Partial<TreeHelperConfig> = {},
): T | T[] | null {
  config = getConfig(config);
  const path: T[] = [];
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
      if (func(node)) {
        return path;
      }
    }
  }
  return null;
}

export function findPathAll(
  tree: any,
  func: Function,
  config: Partial<TreeHelperConfig> = {},
) {
  config = getConfig(config);
  const path: any[] = [];
  const list = [...tree];
  const result: any[] = [];
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
      func(node) && result.push([...path]);
    }
  }
  return result;
}

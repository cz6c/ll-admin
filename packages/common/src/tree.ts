interface TreeHelperConfig {
  id: string;
  children: string;
  pid: string;
}

// 默认配置
const DEFAULT_CONFIG: TreeHelperConfig = {
  id: "id",
  children: "children",
  pid: "parentId"
};

// 获取配置
const getConfig = (config: Partial<TreeHelperConfig>) => Object.assign({}, DEFAULT_CONFIG, config);

/**
 * @description: 数组转树
 * @param list 数组
 * @param config 树节点属性配置
 * @return 树
 */
export function listToTree<T>(list: T[], config: Partial<TreeHelperConfig> = {}): T[] {
  const { id, children, pid } = getConfig(config);
  const nodeMap = new Map();
  const result: any[] = [];

  for (const node of list) {
    (node as any)[children] = (node as any)[children] || [];
    nodeMap.set((node as any)[id], node);
  }
  for (const node of list) {
    const parent = nodeMap.get((node as any)[pid]);
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
export function treeToList<T>(tree: T[], config: Partial<TreeHelperConfig> = {}): T[] {
  const { children } = getConfig(config);
  const result = [...tree];
  for (let i = 0; i < result.length; i++) {
    const node = result[i] as any;
    if (!node[children]) continue;
    result.splice(i + 1, 0, ...node[children]);
  }
  return result;
}

/**
 * @description: 过滤树结构
 * @param tree 树
 * @param callBack 回调 过滤节点处理
 * @param config 树节点属性配置
 * @return 树
 */
export function filterTree<T>(tree: T[], callBack: (n: T) => boolean, config: Partial<TreeHelperConfig> = {}): T[] {
  const { children } = getConfig(config);
  function listFilter(list: T[]) {
    return list.filter((node: any) => {
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
 * @description: 提取树指定结构
 * @param tree 树
 * @param conversion 提取方法
 * @param config 树节点属性配置
 * @return 树
 */
export function conversionTree<T>(tree: T[], conversion: (n: T) => T, config: Partial<TreeHelperConfig> = {}): T[] {
  const { children } = getConfig(config);
  function treeMapEach(data: any, conversion: (n: any) => any, children: string) {
    const haveChildren = Array.isArray(data[children]) && data[children].length > 0;
    const conversionData = conversion(data) || {};
    if (haveChildren) {
      return {
        ...conversionData,
        [children]: data[children].map((i: number) => treeMapEach(i, conversion, children))
      };
    } else {
      return {
        ...conversionData
      };
    }
  }
  return tree.map(item => treeMapEach(item, conversion, children));
}

/**
 * @description: 查找树节点
 * @param tree 树
 * @param callBack 回调
 * @param config 树节点属性配置
 * @return 树节点
 */
export function findNodeFromTree<T>(tree: T[], callBack: (n: T) => boolean, config: Partial<TreeHelperConfig> = {}): T | null {
  const { children } = getConfig(config);
  const list = [...tree];
  for (const node of list) {
    if (callBack(node)) return node;
    (node as any)[children] && list.push(...(node as any)[children]);
  }
  return null;
}

/**
 * @description: 在树结构中查找树某个节点在树中的全路径
 * @param tree 树
 * @param callBack 回调 用于判断节点是否符合条件，返回true就终止遍历,代表已找到
 * @param config 树节点属性配置
 * @return 节点全路径数组（第一个满足条件）
 */
export function findPathFromTree<T>(tree: T[], callBack: (n: T) => boolean, config: Partial<TreeHelperConfig> = {}): T[] | null {
  const { children } = getConfig(config);
  const path = [];
  const list = [...tree];
  const visitedSet = new Set();
  while (list.length) {
    const node = list[0];
    if (visitedSet.has(node)) {
      path.pop();
      list.shift();
    } else {
      visitedSet.add(node);
      (node as any)[children] && list.unshift(...(node as any)[children]);
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
export function findPathAllFromTree<T>(tree: T[], callBack: (n: T) => boolean, config: Partial<TreeHelperConfig> = {}): T[][] {
  const { children } = getConfig(config);
  const path = [];
  const list = [...tree];
  const result = [];
  const visitedSet = new Set();
  while (list.length) {
    const node = list[0];
    if (visitedSet.has(node)) {
      path.pop();
      list.shift();
    } else {
      visitedSet.add(node);
      (node as any)[children] && list.unshift(...(node as any)[children]);
      path.push(node);
      callBack(node) && result.push([...path]);
    }
  }
  return result;
}

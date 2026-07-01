/**
 * 薪资计算器 — 城市选择列表（展示名 + 拼音首字母索引）
 * 计算参数未单独配置的城市在 salaryCalculator 中走默认模板
 */

export interface SalaryCityOption {
  id: string
  name: string
  /** 右侧索引字母 A-Z（不含 I、O、U、V） */
  index: string
}

/** 与示意图一致：热门 8 城 */
export const SALARY_HOT_CITY_IDS: string[] = [
  'beijing',
  'shanghai',
  'guangzhou',
  'shenzhen',
  'hangzhou',
  'chengdu',
  'wuhan',
  'nanjing',
]

export const SALARY_INDEX_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'W', 'X', 'Y', 'Z',
] as const

export type SalaryIndexLetter = (typeof SALARY_INDEX_LETTERS)[number]

/** 按拼音首字母归类的主要城市（可继续扩充） */
export const SALARY_CITIES: SalaryCityOption[] = [
  { id: 'anshan', name: '鞍山市', index: 'A' },
  { id: 'anqing', name: '安庆市', index: 'A' },
  { id: 'anyang', name: '安阳市', index: 'A' },
  { id: 'ankang', name: '安康市', index: 'A' },
  { id: 'beijing', name: '北京市', index: 'B' },
  { id: 'baoding', name: '保定市', index: 'B' },
  { id: 'baotou', name: '包头市', index: 'B' },
  { id: 'benxi', name: '本溪市', index: 'B' },
  { id: 'bengbu', name: '蚌埠市', index: 'B' },
  { id: 'baoji', name: '宝鸡市', index: 'B' },
  { id: 'changchun', name: '长春市', index: 'C' },
  { id: 'changsha', name: '长沙市', index: 'C' },
  { id: 'chengdu', name: '成都市', index: 'C' },
  { id: 'chongqing', name: '重庆市', index: 'C' },
  { id: 'changzhou', name: '常州市', index: 'C' },
  { id: 'cangzhou', name: '沧州市', index: 'C' },
  { id: 'chenzhou', name: '郴州市', index: 'C' },
  { id: 'dalian', name: '大连市', index: 'D' },
  { id: 'dongguan', name: '东莞市', index: 'D' },
  { id: 'datong', name: '大同市', index: 'D' },
  { id: 'deyang', name: '德阳市', index: 'D' },
  { id: 'eerduosi', name: '鄂尔多斯市', index: 'E' },
  { id: 'foshan', name: '佛山市', index: 'F' },
  { id: 'fuzhou_fj', name: '福州市', index: 'F' },
  { id: 'fushun', name: '抚顺市', index: 'F' },
  { id: 'guangzhou', name: '广州市', index: 'G' },
  { id: 'guiyang', name: '贵阳市', index: 'G' },
  { id: 'guilin', name: '桂林市', index: 'G' },
  { id: 'handan', name: '邯郸市', index: 'H' },
  { id: 'harbin', name: '哈尔滨市', index: 'H' },
  { id: 'haikou', name: '海口市', index: 'H' },
  { id: 'hefei', name: '合肥市', index: 'H' },
  { id: 'huizhou', name: '惠州市', index: 'H' },
  { id: 'hangzhou', name: '杭州市', index: 'H' },
  { id: 'huhhot', name: '呼和浩特市', index: 'H' },
  { id: 'jinan', name: '济南市', index: 'J' },
  { id: 'jiaxing', name: '嘉兴市', index: 'J' },
  { id: 'jilin_city', name: '吉林市', index: 'J' },
  { id: 'jiamusi', name: '佳木斯市', index: 'J' },
  { id: 'jingzhou', name: '荆州市', index: 'J' },
  { id: 'kunming', name: '昆明市', index: 'K' },
  { id: 'kaifeng', name: '开封市', index: 'K' },
  { id: 'lanzhou', name: '兰州市', index: 'L' },
  { id: 'luoyang', name: '洛阳市', index: 'L' },
  { id: 'langfang', name: '廊坊市', index: 'L' },
  { id: 'liuzhou', name: '柳州市', index: 'L' },
  { id: 'mianyang', name: '绵阳市', index: 'M' },
  { id: 'mudanjiang', name: '牡丹江市', index: 'M' },
  { id: 'nanchang', name: '南昌市', index: 'N' },
  { id: 'nanjing', name: '南京市', index: 'N' },
  { id: 'nanning', name: '南宁市', index: 'N' },
  { id: 'ningbo', name: '宁波市', index: 'N' },
  { id: 'pingdingshan', name: '平顶山市', index: 'P' },
  { id: 'qingdao', name: '青岛市', index: 'Q' },
  { id: 'quanzhou', name: '泉州市', index: 'Q' },
  { id: 'qinhuangdao', name: '秦皇岛市', index: 'Q' },
  { id: 'rizhao', name: '日照市', index: 'R' },
  { id: 'shanghai', name: '上海市', index: 'S' },
  { id: 'shenzhen', name: '深圳市', index: 'S' },
  { id: 'shenyang', name: '沈阳市', index: 'S' },
  { id: 'shijiazhuang', name: '石家庄市', index: 'S' },
  { id: 'suzhou', name: '苏州市', index: 'S' },
  { id: 'shaoxing', name: '绍兴市', index: 'S' },
  { id: 'sanya', name: '三亚市', index: 'S' },
  { id: 'tangshan', name: '唐山市', index: 'T' },
  { id: 'tianjin', name: '天津市', index: 'T' },
  { id: 'taizhou_js', name: '泰州市', index: 'T' },
  { id: 'weifang', name: '潍坊市', index: 'W' },
  { id: 'weihai', name: '威海市', index: 'W' },
  { id: 'wuhan', name: '武汉市', index: 'W' },
  { id: 'wuxi', name: '无锡市', index: 'W' },
  { id: 'wenzhou', name: '温州市', index: 'W' },
  { id: 'xian', name: '西安市', index: 'X' },
  { id: 'xiamen', name: '厦门市', index: 'X' },
  { id: 'xuzhou', name: '徐州市', index: 'X' },
  { id: 'xingtai', name: '邢台市', index: 'X' },
  { id: 'yantai', name: '烟台市', index: 'Y' },
  { id: 'yinchuan', name: '银川市', index: 'Y' },
  { id: 'yangzhou', name: '扬州市', index: 'Y' },
  { id: 'zhuhai', name: '珠海市', index: 'Z' },
  { id: 'zhengzhou', name: '郑州市', index: 'Z' },
  { id: 'zhongshan', name: '中山市', index: 'Z' },
  { id: 'zhenjiang', name: '镇江市', index: 'Z' },
  { id: 'zhuzhou', name: '株洲市', index: 'Z' },
]

export function getSalaryCityName(id: string): string {
  return SALARY_CITIES.find(c => c.id === id)?.name ?? ''
}

export function filterSalaryCities(keyword: string): SalaryCityOption[] {
  const k = keyword.trim()
  if (!k)
    return []
  return SALARY_CITIES.filter(c => c.name.includes(k))
}

export function groupSalaryCitiesByIndex(): Record<string, SalaryCityOption[]> {
  const map: Record<string, SalaryCityOption[]> = {}
  for (const c of SALARY_CITIES) {
    if (!map[c.index])
      map[c.index] = []
    map[c.index].push(c)
  }
  for (const key of Object.keys(map))
    map[key].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  return map
}

export function hotSalaryCityOptions(): SalaryCityOption[] {
  return SALARY_HOT_CITY_IDS
    .map(id => SALARY_CITIES.find(c => c.id === id))
    .filter((c): c is SalaryCityOption => !!c)
}

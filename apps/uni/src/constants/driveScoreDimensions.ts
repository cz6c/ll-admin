/**
 * 试驾体验打分维度配置
 * code 稳定，对应服务端字段；改文案不改表结构
 * 以下核心问题、子观察点、试驾方法和锚点文案为草稿，待产品打分表审阅后替换
 */
export type DriveScoreCategory = 'hardware' | 'comfort'

export type DriveScoreCode =
  | 'chassisSolidity'
  | 'handling'
  | 'highSpeedStability'
  | 'quietness'
  | 'seatingVisibility'
  | 'blindOperation'

export interface DriveScoreAnchors {
  1: string
  3: string
  5: string
}

export interface DriveScoreDimension {
  code: DriveScoreCode
  category: DriveScoreCategory
  title: string
  /** 核心问题，一行展示 */
  question: string
  /** 子观察点 */
  checkpoints: string[]
  /** 试驾方法 */
  method: string
  anchors: DriveScoreAnchors
  /** 对应接口分数字段 */
  scoreKey: DriveScoreScoreKey
}

export type DriveScoreScoreKey =
  | 'scoreChassisSolidity'
  | 'scoreHandling'
  | 'scoreHighSpeedStability'
  | 'scoreQuietness'
  | 'scoreSeatingVisibility'
  | 'scoreBlindOperation'

export const DRIVE_SCORE_CATEGORY_LABEL: Record<DriveScoreCategory, string> = {
  hardware: '硬件 · 底盘与驾驶机械素质',
  comfort: '软件/舒适 · 日常从容感',
}

export const DRIVE_SCORE_DIMENSIONS: DriveScoreDimension[] = [
  {
    code: 'chassisSolidity',
    category: 'hardware',
    title: '底盘厚重感',
    question: '过沟坎、接缝时，车身是不是沉得住、不发飘？',
    checkpoints: ['过减速带后的余振长短', '路面接缝传入的震动和噪音', '悬挂把车身拉住的速度'],
    method: '选一段有井盖或接缝的城市路，约 40km/h 匀速通过，感受垂直和横向余振是否很快收敛。',
    anchors: {
      1: '发飘、余振长，像踩在薄板上',
      3: '大多数颠簸能托住，偶有多余跳动',
      5: '厚实沉稳，余振短，路面被压住',
    },
    scoreKey: 'scoreChassisSolidity',
  },
  {
    code: 'handling',
    category: 'hardware',
    title: '操控感',
    question: '方向准不准、车头跟不跟手，会不会钝或神经质？',
    checkpoints: ['转向虚量大小', '回正是否自然', '变线时车身姿态是否可预期'],
    method: '在安全空旷路段做温和变线和低速 U 形转弯，注意方向盘从居中到起作用的行程。',
    anchors: {
      1: '虚位大或过度灵敏，车头不好预判',
      3: '指向清楚，但偶有延迟或略沉',
      5: '指向精确、回馈自然，车头跟手',
    },
    scoreKey: 'scoreHandling',
  },
  {
    code: 'highSpeedStability',
    category: 'hardware',
    title: '高速稳定性',
    question: '100km/h 以上是否稳，会不会晃、飘、需要不停修正？',
    checkpoints: ['直线保持能力', '侧风或超车气流下的摆动', '细小修正是否频繁'],
    method: '在合法高速路段巡航，双手轻扶方向盘，感受是否需要频繁微调。',
    anchors: {
      1: '发飘或摆动，要不停纠正',
      3: '整体可接受，偶遇气流需轻轻修正',
      5: '巡航很稳，轻扶就能走直线',
    },
    scoreKey: 'scoreHighSpeedStability',
  },
  {
    code: 'quietness',
    category: 'comfort',
    title: '静谧性',
    question: '风噪、胎噪、路噪会不会抢话、让人累？',
    checkpoints: ['60/80/100 不同车速的噪声变化', '风噪是否刺耳', '主驾与后排差异'],
    method: '关闭音乐，在干燥铺装路匀速巡航，试着正常说话，判断要不要提高音量。',
    anchors: {
      1: '噪声明显，说话要提高音量',
      3: '有背景声但不刺耳，短途可接受',
      5: '舱内安静从容，低声交流也不费力',
    },
    scoreKey: 'scoreQuietness',
  },
  {
    code: 'seatingVisibility',
    category: 'comfort',
    title: '坐姿与视野',
    question: '坐进去是否自然，前视、A 柱、后视清不清晰？',
    checkpoints: ['臀膝位置是否别扭', '方向盘是否遮挡仪表', 'A 柱盲区和后视预瞄'],
    method: '调到日常坐姿，看红绿灯、路口左右和倒车预瞄是否轻松，是否需要探头。',
    anchors: {
      1: '坐姿别扭或视野局促，要探头',
      3: '基本够用，个别角度要稍微迁就',
      5: '坐姿自然，前方和四周都看得清楚',
    },
    scoreKey: 'scoreSeatingVisibility',
  },
  {
    code: 'blindOperation',
    category: 'comfort',
    title: '盲操便利性',
    question: '常用按键、换挡和常用开关，不低头能不能摸到、好不好用？',
    checkpoints: ['方向盘或转向柱按键位置', '换挡是否好摸', '音量、车窗等常用开关能否盲操'],
    method: '注意安全的前提下，行驶中凭触觉完成音量或常用开关操作，看是否需要盯着屏幕。',
    anchors: {
      1: '常用功能要盯着找，打断驾驶',
      3: '主要功能找得到，部分仍要看一眼',
      5: '常用操作可盲操，手感清楚不打断视线',
    },
    scoreKey: 'scoreBlindOperation',
  },
]

/**
 * 当前分对应锚点提示
 * 整数 1/3/5 用锚点原文；半分及 2/4 归入相邻锚点区间说明
 */
export function getDriveScoreAnchorHint(dimension: DriveScoreDimension, score: number): string {
  if (score === 1 || score === 3 || score === 5)
    return dimension.anchors[score as 1 | 3 | 5]
  if (score > 0 && score < 3)
    return `介于「${dimension.anchors[1]}」与「${dimension.anchors[3]}」之间`
  if (score > 3 && score <= 5)
    return `介于「${dimension.anchors[3]}」与「${dimension.anchors[5]}」之间`
  return ''
}

export const HARDWARE_DIMENSIONS = DRIVE_SCORE_DIMENSIONS.filter(item => item.category === 'hardware')
export const COMFORT_DIMENSIONS = DRIVE_SCORE_DIMENSIONS.filter(item => item.category === 'comfort')

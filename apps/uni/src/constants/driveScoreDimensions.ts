/**
 * 试驾体验打分维度配置（终版六维）
 * code / scoreKey 与 server Entity 列一一对应；评判标准与 1～5 档文案仅存前端
 */
export type DriveScoreCode =
  | 'powerResponse'
  | 'chassisControl'
  | 'steeringBraking'
  | 'nvhPosture'
  | 'hmiAdas'
  | 'energyRange'

export type DriveScoreAnchors = Record<1 | 2 | 3 | 4 | 5, string>

export interface DriveScoreDimension {
  code: DriveScoreCode
  title: string
  /** 雷达图轴标签，避免过长截断 */
  shortTitle: string
  /** 评判标准（折叠展示） */
  criteria: string
  anchors: DriveScoreAnchors
  scoreKey: DriveScoreScoreKey
}

export type DriveScoreScoreKey =
  | 'scorePowerResponse'
  | 'scoreChassisControl'
  | 'scoreSteeringBraking'
  | 'scoreNvhPosture'
  | 'scoreHmiAdas'
  | 'scoreEnergyRange'

export const DRIVE_SCORE_DIMENSIONS: DriveScoreDimension[] = [
  {
    code: 'powerResponse',
    title: '动力响应与平顺性',
    shortTitle: '动力平顺',
    criteria:
      '起步/低速跟车/中途加速/高速再加速是否跟脚；油门电门线性度；变速箱顿挫、油电切换是否突兀；能量回收拖拽感是否自然可调；地库低速蠕行是否平顺。',
    anchors: {
      1: '踩下不走或一窜一窜，顿挫/切换/回收突兀难适应，拥堵和挪车明显难受。',
      2: '动力够但响应偏慢，低速跟车有顿挫/窜动，回收拖拽明显或地库蠕行需小心。',
      3: '主流水平，动力够用、跟脚，变速箱/切换/回收有可感知但不扰人的小动作。',
      4: '响应快且线性，低速偶有轻微顿挫或回收需短暂适应，整体优于多数同级。',
      5: '起步跟脚、全速域随踩随有，变速箱/油电切换和能量回收都平顺自然，地库拥堵蠕行轻松。',
    },
    scoreKey: 'scorePowerResponse',
  },
  {
    code: 'chassisControl',
    title: '底盘滤震与车身控制',
    shortTitle: '底盘滤震',
    criteria:
      '过减速带/井盖的滤震、余震、厚重感；变线、匝道、急弯的侧倾和车尾跟随性；高速稳定性；烂路是否松散。',
    anchors: {
      1: '过坎弹跳余震明显、底盘松散，变线发飘或侧倾吓人。',
      2: '滤震生硬或松散余震多，快速变线侧倾大/车尾慢，高速信心一般。',
      3: '主流水平，减速带井盖能过滤但有余震，侧倾可控，高速稳定。',
      4: '滤震有韧性、余震少，车身控制好，急变线略有侧倾但可控。',
      5: '滤震高级、一次收住，烂路厚重，变线匝道侧倾小、车尾跟随好，高速很稳。',
    },
    scoreKey: 'scoreChassisControl',
  },
  {
    code: 'steeringBraking',
    title: '转向与制动',
    shortTitle: '转向制动',
    criteria:
      '转向力度、虚位、回正是否自然，低速挪车轻便、高速是否稳；刹车初段空程、线性度、紧急制动点头；动能回收与机械刹车衔接。',
    anchors: {
      1: '转向模糊难控，刹车空程大/紧急点头严重，驾驶信心差。',
      2: '转向虚位大/高速发飘，刹车不线性或点头明显，回收衔接突兀。',
      3: '主流水平，转向有轻微虚位/力度可接受，刹车初段略空但可控。',
      4: '指向准、力度随速自然，刹车线性信心足，轻微初段空或回收衔接可感。',
      5: '转向精准自然、低速轻高速稳，刹车线性无空程，回收与机械刹车无感衔接。',
    },
    scoreKey: 'scoreSteeringBraking',
  },
  {
    code: 'nvhPosture',
    title: 'NVH与驾驶坐姿',
    shortTitle: 'NVH坐姿',
    criteria:
      '风噪、胎噪、发动机/电机噪声、底盘噪音；座椅支撑、方向盘/踏板位置、视野盲区、长时间驾驶疲劳感。',
    anchors: {
      1: '噪音扰人，坐姿/视野明显影响驾驶，长时间难受。',
      2: '高速风胎/发动机噪音明显，坐姿别扭或视野盲区大，容易疲劳。',
      3: '主流水平，噪音可接受，坐姿需小幅调整，长时间略疲劳。',
      4: '静谧性好，高速噪音可控，座椅支撑和方向盘/踏板位置自然。',
      5: '同级标杆静谧，风胎/发动机电机噪音抑制好，坐姿视野极佳，长途不累。',
    },
    scoreKey: 'scoreNvhPosture',
  },
  {
    code: 'hmiAdas',
    title: '驾驶相关人机与辅助驾驶',
    shortTitle: '人机辅助',
    criteria:
      '方向盘按键、挡位、空调/中控操作是否顺手，是否需低头分心；屏幕是否挡视线；ACC跟车、车道保持加减速是否平顺，接管/退出逻辑是否清晰。',
    anchors: {
      1: '操作反人类或辅助不可用/惊吓，明显影响驾驶。',
      2: '常用操作需低头，辅助画龙/急刹/退出不清晰，明显分散注意力。',
      3: '主流水平，常用操作需短暂适应，辅助可用但加减速/车道保持一般。',
      4: '人机顺手，辅助平顺可靠，偶需适应菜单或按键。',
      5: '常用操作盲操顺手，屏幕不挡视线，ACC/车道保持加减速自然、接管清晰。',
    },
    scoreKey: 'scoreHmiAdas',
  },
  {
    code: 'energyRange',
    title: '能耗/续航与补能',
    shortTitle: '能耗补能',
    criteria:
      '记录试驾前后表显续航、里程、平均电耗/油耗，看掉电是否线性；纯电看续航达成率、高速/空调能耗；混动/增程看亏电油耗和亏电动力；补能看快充功率、兼容性、加油便利性，有条件试充10分钟。油车把「补能」理解为油耗与加油便利。',
    anchors: {
      1: '能耗离谱/续航严重虚标，补能很不便，亏电体验差。',
      2: '能耗偏高/掉电偏快，快充慢或加油不便，亏电油耗/动力明显变差。',
      3: '主流水平，能耗合理，续航有正常折损，补能便利性可接受。',
      4: '能耗优于多数同级，续航较实，补能效率好，亏电动力油耗可接受。',
      5: '能耗/油耗同级标杆，表显续航扎实掉电线性，快充功率高兼容好/加油便利，亏电表现稳定。',
    },
    scoreKey: 'scoreEnergyRange',
  },
]

/**
 * 当前分对应评判文案：整星用锚点；半分标明介于上下档并附两段摘要
 */
export function getDriveScoreAnchorHint(dimension: DriveScoreDimension, score: number): string {
  if (!(score >= 0.5 && score <= 5))
    return ''
  const int = Math.round(score * 2) / 2
  if (Number.isInteger(int) && int >= 1 && int <= 5)
    return dimension.anchors[int as 1 | 2 | 3 | 4 | 5]
  const low = Math.floor(score) as 1 | 2 | 3 | 4
  const high = Math.ceil(score) as 2 | 3 | 4 | 5
  return `介于 ${low} 分与 ${high} 分。${low} 分：${dimension.anchors[low]} ${high} 分：${dimension.anchors[high]}`
}
import * as dict from "./dict";

export function getEnum2Array(type: string) {
  const enumObj = dict[type];
  const data = dict[type.replace("Enum", "")] || {};
  return Object.keys(enumObj).map(k => ({
    dictValue: enumObj[k],
    dictLabel: data[enumObj[k]] || k
  }));
}

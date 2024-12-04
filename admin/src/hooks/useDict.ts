import { getDicts } from "@/api/public";
import { useDictStore } from "@/store/modules/dict";

interface DictData {
  label: string;
  value: string;
  elTagType: string;
}

export interface DictDataMap {
  [key: string]: DictData[];
}

/**
 * 获取字典数据
 */
export function useDict(...args) {
  const dict = reactive({});
  return (() => {
    args.forEach(dictType => {
      dict[dictType] = [];
      const dicts = useDictStore().getDict(dictType);
      if (dicts) {
        dict[dictType] = dicts;
      } else {
        getDicts(dictType).then(resp => {
          dict[dictType] = resp.data.map(p => ({
            label: p.dictLabel,
            value: p.dictValue
            // elTagType: p.listClass
          }));
          useDictStore().setDict(dictType, dict[dictType]);
        });
      }
    });
    return dict as DictDataMap;
  })();
}

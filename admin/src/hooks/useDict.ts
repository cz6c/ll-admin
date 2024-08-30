import { useDictStore } from "@/store/modules/dict";
import { getDicts } from "@/api/system/dict/data";

export interface DictData {
  label: string;
  value: string;
  elTagType: string;
}

/**
 * 获取字典数据
 */
export function useDict<T extends object>(...args) {
  const dict = reactive({}) as T;
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
            value: p.dictValue,
            elTagType: p.listClass
          }));
          useDictStore().setDict(dictType, dict[dictType]);
        });
      }
    });
    return toRefs(dict);
  })();
}

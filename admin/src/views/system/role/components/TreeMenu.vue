<template>
  <el-tree
    ref="treeRef"
    :data="getDynamicRoutes"
    show-checkbox
    default-expand-all
    node-key="id"
    :props="defaultProps"
    @check="getCheckedKeys"
  />
</template>

<script lang="ts" setup name="TreeMenu">
import { ref, computed, watch } from "vue";
import { ElTree } from "element-plus";
import { useAuthStore } from "@/store/modules/auth";
import { eachTree } from "@/utils/tree";

interface Props {
  modelValue: number[] | string;
}

const props = defineProps<Props>();

const emits = defineEmits(["update:modelValue"]);

const checkedKeys = computed({
  get: () => props.modelValue,
  set: value => {
    emits("update:modelValue", value);
  },
});

const defaultProps = {
  children: "children",
  label: "path",
};

const treeRef = ref<InstanceType<typeof ElTree>>();

const { getDynamicRoutes } = useAuthStore();

/**
 * @description: 计算所有pid
 */
const pids = computed(() => {
  let pids: number[] = [];
  eachTree(getDynamicRoutes, (element: any) => {
    element.pid && pids.push(element.pid);
  });
  return [...new Set(pids)];
});

/**
 * @description: 数据响应
 */
watch(
  () => {
    return props.modelValue;
  },
  value => {
    setCheckedKeys(value as number[]);
  },
);
/**
 * @description: 获取当前选中节点 key 的数组
 */
function getCheckedKeys() {
  checkedKeys.value = [...treeRef.value!.getCheckedKeys(), ...treeRef.value!.getHalfCheckedKeys()] as number[];
}
/**
 * @description: 设置目前选中的节点
 */
function setCheckedKeys(ids: string[]) {
  const arr = ids.filter(c => !pids.value.includes(c));
  treeRef.value!.setCheckedKeys(arr);
}
</script>

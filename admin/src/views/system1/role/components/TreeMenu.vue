<template>
  <el-tree
    ref="treeRef"
    :data="routes"
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
import { usePermissionStore } from "@/store/modules/permission";
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

const routes = computed(() => usePermissionStore().routes);


/**
 * @description: 计算所有pid
 */
const pids = computed(() => {
  let pids: number[] = [];
  eachTree(routes.value, (element: any) => {
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
    setCheckedKeys(value as unknown as number[]);
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
function setCheckedKeys(ids: number[]) {
  const arr = ids.filter(c => !pids.value.includes(c));
  treeRef.value!.setCheckedKeys(arr);
}
</script>

<template>
  <div class="page cz-card">
    <div class="title">权限按钮</div>
    <el-button v-auth="'1000'" type="primary"> 拥有code ['1000']权限可见 </el-button>
    <el-button v-auth="'2000'" type="primary"> 拥有code ['2000']权限可见 </el-button>
    <el-button v-auth="'3000'" type="primary"> 拥有code ['3000']权限可见 </el-button>
    <el-button v-auth="'4000'" type="primary"> 拥有code ['4000']权限可见 </el-button>
    <div class="title">删除</div>
    <el-button type="danger" @click="handleClick(1, '1000')"> 删除['1000']权限 </el-button>
    <el-button type="danger" @click="handleClick(1, '2000')"> 删除['2000']权限 </el-button>
    <el-button type="danger" @click="handleClick(1, '3000')"> 删除['3000']权限 </el-button>
    <el-button type="danger" @click="handleClick(1, '4000')"> 删除['4000']权限 </el-button>
    <div class="title">新增</div>
    <el-button type="success" @click="handleClick(2, '1000')"> 新增['1000']权限 </el-button>
    <el-button type="success" @click="handleClick(2, '2000')"> 新增['2000']权限 </el-button>
    <el-button type="success" @click="handleClick(2, '3000')"> 新增['3000']权限 </el-button>
    <el-button type="success" @click="handleClick(2, '4000')"> 新增['4000']权限 </el-button>
  </div>
</template>

<script setup lang="ts" name="Auth">
import { computed } from "vue";
import { useAuthStore } from "@/store/modules/auth";

const authStore = useAuthStore();
const router = useRouter();
const codeList = computed(() => authStore.getPermCodeList);

function handleClick(type: number, value: string) {
  if (type === 1) {
    const index = codeList.value.indexOf(value);
    if (index === -1) return;
    codeList.value.splice(index, 1);
  } else {
    if (codeList.value.includes(value)) return;
    codeList.value.push(value);
  }
  // authStore.setPermCodeList(codeList.value);
  const { path, query } = router.currentRoute.value;
  router.replace({
    path: "/redirect" + path,
    query: query
  });
}
</script>

<style scoped lang="scss">
.page {
  border-radius: 16px;
  padding: 16px;
  background-color: #fff;
  box-sizing: border-box;

  .title {
    margin: 16px 0;
    font-size: 16px;
  }
}
</style>

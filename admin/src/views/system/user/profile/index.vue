<template>
  <div class="app-page">
    <el-row :gutter="20">
      <el-col :span="6" :xs="24">
        <el-card class="box-card">
          <template v-slot:header>
            <div class="clearfix">
              <span>个人信息</span>
            </div>
          </template>
          <div>
            <div class="text-center">
              <userAvatar :user="state.user" />
            </div>
            <div class="list-group">
              <div class="list-group-item">
                <div class="label"><SvgIcon name="user" /><span>用户名称：</span></div>
                <div class="value">{{ state.user.userName }}</div>
              </div>
              <div class="list-group-item">
                <div class="label"><SvgIcon name="phone" /><span>手机号码：</span></div>
                <div class="value">{{ state.user.phonenumber }}</div>
              </div>
              <div class="list-group-item">
                <div class="label"><SvgIcon name="email" /><span>用户邮箱：</span></div>
                <div class="value">{{ state.user.email }}</div>
              </div>
              <div class="list-group-item">
                <div class="label"><SvgIcon name="tree" /><span>所属部门：</span></div>
                <div v-if="state.user.dept" class="value">{{ state.user.dept.deptName }} / {{ state.postGroup }}</div>
              </div>
              <div class="list-group-item">
                <div class="label"><SvgIcon name="peoples" /><span>所属角色：</span></div>
                <div class="value">{{ state.roleGroup }}</div>
              </div>
              <div class="list-group-item">
                <div class="label"><SvgIcon name="date" /><span>创建日期：</span></div>
                <div class="value">{{ state.user.createTime }}</div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="18" :xs="24">
        <el-card>
          <template v-slot:header>
            <div class="clearfix">
              <span>基本资料</span>
            </div>
          </template>
          <el-tabs v-model="activeTab">
            <el-tab-pane label="基本资料" name="userinfo">
              <userInfo v-model:user="state.user" />
            </el-tab-pane>
            <el-tab-pane label="修改密码" name="resetPwd">
              <resetPwd />
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import userAvatar from "./userAvatar.vue";
import userInfo from "./userInfo.vue";
import resetPwd from "./resetPwd.vue";
import { getUserProfile } from "@/api/system/user";
import { UserProfile } from "#/api/system/user";

defineOptions({
  name: "Profile"
});

const activeTab = ref("userinfo");
const state = reactive({
  user: {} as UserProfile,
  roleGroup: null,
  postGroup: null
});

function getUser() {
  getUserProfile().then(response => {
    state.user = response.data;
    // state.roleGroup = response.roleGroup;
    // state.postGroup = response.postGroup;
  });
}

getUser();
</script>

<style lang="scss" scoped>
.list-group {
  .list-group-item {
    margin-top: 20px;
    display: flex;
    align-items: center;
    .label {
      display: flex;
      align-items: center;
      span {
        margin-left: 8px;
      }
    }
  }
}
</style>

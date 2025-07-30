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
              <userAvatar :user="state" />
            </div>
            <div class="list-group">
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ep:user" /><span>用户名称：</span></div>
                <div class="value">{{ state.userName }}</div>
              </div>
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ep:iphone" /><span>手机号码：</span></div>
                <div class="value">{{ state.phonenumber }}</div>
              </div>
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ep:message" /><span>用户邮箱：</span></div>
                <div class="value">{{ state.email }}</div>
              </div>
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ri:git-branch-line" /><span>所属部门：</span></div>
                <div v-if="state.dept" class="value">
                  {{ state.dept.deptName }}
                </div>
              </div>
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ep:suitcase" /><span>所属岗位：</span></div>
                <div v-if="state.posts" class="value">
                  {{ state.posts?.map(c => c.postName).join(",") }}
                </div>
              </div>
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ri:user-settings-line" /><span>所属角色：</span></div>
                <div class="value">
                  {{ state.roles?.map(c => c.roleName).join(",") }}
                </div>
              </div>
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ep:calendar" /><span>创建日期：</span></div>
                <div class="value">{{ state.createTime }}</div>
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
              <userInfo v-model:user="state" />
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
import { UserProfileVo } from "#/api/system/user";

defineOptions({
  name: "Profile"
});

const activeTab = ref("userinfo");
const state = ref({} as UserProfileVo);

function getUser() {
  getUserProfile().then(response => {
    state.value = response.data;
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

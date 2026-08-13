<template>
  <div class="app-page">
    <a-row :gutter="20">
      <a-col :span="8">
        <a-card class="box-card">
          <template #title>
            <div class="clearfix">
              <span>个人信息</span>
            </div>
          </template>
          <div>
            <div class="flex-center">
              <userAvatar :user="state" />
            </div>
            <div class="list-group">
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ant-design:user-outlined" /><span>用户名称：</span></div>
                <div class="value">{{ state.userName }}</div>
              </div>
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ant-design:mobile-outlined" /><span>手机号码：</span></div>
                <div class="value">{{ state.phonenumber }}</div>
              </div>
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ant-design:mail-outlined" /><span>用户邮箱：</span></div>
                <div class="value">{{ state.email }}</div>
              </div>
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ant-design:apartment-outlined" /><span>所属部门：</span></div>
                <div v-if="state.dept" class="value">
                  {{ state.dept.deptName }}
                </div>
              </div>
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ant-design:idcard-outlined" /><span>所属岗位：</span></div>
                <div v-if="state.posts" class="value">
                  {{ state.posts?.map(c => c.postName).join(",") }}
                </div>
              </div>
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ant-design:user-switch-outlined" /><span>所属角色：</span></div>
                <div class="value">
                  {{ state.roles?.map(c => c.roleName).join(",") }}
                </div>
              </div>
              <div class="list-group-item">
                <div class="label"><IconifyIcon icon="ant-design:calendar-outlined" /><span>创建日期：</span></div>
                <div class="value">{{ state.createTime }}</div>
              </div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :span="16">
        <a-card>
          <template #title>
            <div class="clearfix">
              <span>基本资料</span>
            </div>
          </template>
          <a-tabs v-model:activeKey="activeTab">
            <a-tab-pane key="userinfo" tab="基本资料">
              <userInfo v-model:user="state" />
            </a-tab-pane>
            <a-tab-pane key="resetPwd" tab="修改密码">
              <resetPwd />
            </a-tab-pane>
          </a-tabs>
        </a-card>
      </a-col>
    </a-row>
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

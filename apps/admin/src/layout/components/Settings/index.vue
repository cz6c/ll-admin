<template>
  <el-drawer v-model="showSettings" :withHeader="false" direction="rtl" size="300px">
    <h3 class="drawer-title">系统配置</h3>
    <el-divider />
    <div class="drawer-item">
      <span>主题色</span>
      <span class="comp-style">
        <el-color-picker v-model="theme" :predefine="predefineColors" @change="themeChange" />
      </span>
    </div>

    <div class="drawer-item">
      <span>灰色模式</span>
      <span class="comp-style">
        <el-switch v-model="greyVal" inline-prompt active-text="开" inactive-text="关" />
      </span>
    </div>

    <div class="drawer-item">
      <span>色弱模式</span>
      <span class="comp-style">
        <el-switch v-model="weakVal" inline-prompt active-text="开" inactive-text="关" />
      </span>
    </div>

    <div class="drawer-item">
      <span>标签页</span>
      <span class="comp-style">
        <el-switch v-model="tagsView" inline-prompt active-text="开" inactive-text="关" />
      </span>
    </div>

    <div class="drawer-item">
      <span>Logo</span>
      <span class="comp-style">
        <el-switch v-model="sidebarLogo" inline-prompt active-text="开" inactive-text="关" />
      </span>
    </div>

    <el-divider />

    <el-button type="primary" plain :icon="useRenderIcon('ep:document-add')" @click="saveSetting">保存配置</el-button>
    <el-button plain :icon="useRenderIcon('ep:refresh')" @click="resetSetting">重置配置</el-button>
  </el-drawer>
</template>

<script setup>
import { useSettingsStore } from "@/store/modules/settings";
import { WebStorage } from "@/utils/storage";
import $feedback from "@/utils/feedback";
import { useRenderIcon } from "@/hooks/useRenderIcon";

const settingsStore = useSettingsStore();
const showSettings = ref(false);
const storeSettings = computed(() => settingsStore);
const predefineColors = ref(["#605fec", "#409EFF", "#ff4500", "#ff8c00", "#ffd700", "#90ee90", "#00ced1", "#1e90ff", "#c71585"]);

const theme = computed({
  get: () => storeSettings.value.theme,
  set: val => {
    settingsStore.changeSetting({ key: "theme", value: val });
  }
});
const greyVal = computed({
  get: () => storeSettings.value.greyVal,
  set: val => {
    settingsStore.changeSetting({ key: "greyVal", value: val });
  }
});
const weakVal = computed({
  get: () => storeSettings.value.weakVal,
  set: val => {
    settingsStore.changeSetting({ key: "weakVal", value: val });
  }
});
const tagsView = computed({
  get: () => storeSettings.value.tagsView,
  set: val => {
    settingsStore.changeSetting({ key: "tagsView", value: val });
  }
});
const sidebarLogo = computed({
  get: () => storeSettings.value.sidebarLogo,
  set: val => {
    settingsStore.changeSetting({ key: "sidebarLogo", value: val });
  }
});

function saveSetting() {
  $feedback.loading("正在保存到本地，请稍候...");
  let layoutSetting = {
    theme: storeSettings.value.theme,
    greyVal: storeSettings.value.greyVal,
    weakVal: storeSettings.value.weakVal,
    tagsView: storeSettings.value.tagsView,
    sidebarLogo: storeSettings.value.sidebarLogo
  };
  new WebStorage("localStorage").setItem("layout-setting", layoutSetting);
  setTimeout($feedback.closeLoading(), 1000);
}
function resetSetting() {
  $feedback.loading("正在清除设置缓存并刷新，请稍候...");
  new WebStorage("localStorage").removeItem("layout-setting");
  setTimeout("window.location.reload()", 1000);
}
function openSetting() {
  showSettings.value = true;
}

defineExpose({
  openSetting
});
</script>

<style lang="scss" scoped>
.drawer-title {
  font-weight: bold;
  font-size: 16px;
}

.drawer-item {
  padding: 12px 0;
  font-size: 14px;

  .comp-style {
    float: right;
    margin: -3px 8px 0px 0px;
  }
}
</style>

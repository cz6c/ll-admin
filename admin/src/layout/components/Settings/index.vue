<template>
  <el-drawer v-model="showSettings" :withHeader="false" direction="rtl" size="300px">
    <div class="drawer-item">
      <span>主题颜色</span>
      <span class="comp-style">
        <el-color-picker v-model="theme" :predefine="predefineColors" @change="themeChange" />
      </span>
    </div>

    <el-divider />

    <h3 class="drawer-title">系统布局配置</h3>

    <div class="drawer-item">
      <span>开启 Tags-Views</span>
      <span class="comp-style">
        <el-switch v-model="tagsView" class="drawer-switch" />
      </span>
    </div>

    <div class="drawer-item">
      <span>显示 Logo</span>
      <span class="comp-style">
        <el-switch v-model="sidebarLogo" class="drawer-switch" />
      </span>
    </div>

    <el-divider />

    <el-button type="primary" plain icon="DocumentAdd" @click="saveSetting">保存配置</el-button>
    <el-button plain icon="Refresh" @click="resetSetting">重置配置</el-button>
  </el-drawer>
</template>

<script setup>
import { useSettingsStore } from "@/store/modules/settings";
import { WebStorage } from "@/utils/storage";

const { proxy } = getCurrentInstance();
const settingsStore = useSettingsStore();
const showSettings = ref(false);
const theme = ref(settingsStore.theme);
const storeSettings = computed(() => settingsStore);
const predefineColors = ref(["#409EFF", "#ff4500", "#ff8c00", "#ffd700", "#90ee90", "#00ced1", "#1e90ff", "#c71585"]);

/** 是否需要tagview */
const tagsView = computed({
  get: () => storeSettings.value.tagsView,
  set: val => {
    settingsStore.changeSetting({ key: "tagsView", value: val });
  },
});
/**是否需要侧边栏的logo */
const sidebarLogo = computed({
  get: () => storeSettings.value.sidebarLogo,
  set: val => {
    settingsStore.changeSetting({ key: "sidebarLogo", value: val });
  },
});

function themeChange(val) {
  settingsStore.changeSetting({ key: "theme", value: val });
  theme.value = val;
}
function saveSetting() {
  proxy.$modal.loading("正在保存到本地，请稍候...");
  let layoutSetting = {
    tagsView: storeSettings.value.tagsView,
    sidebarLogo: storeSettings.value.sidebarLogo,
    theme: storeSettings.value.theme,
  };
  new WebStorage("localStorage").setItem("layout-setting", layoutSetting);
  setTimeout(proxy.$modal.closeLoading(), 1000);
}
function resetSetting() {
  proxy.$modal.loading("正在清除设置缓存并刷新，请稍候...");
  new WebStorage("localStorage").removeItem("layout-setting");
  setTimeout("window.location.reload()", 1000);
}
function openSetting() {
  showSettings.value = true;
}

defineExpose({
  openSetting,
});
</script>

<style lang="scss" scoped>
.setting-drawer-title {
  margin-bottom: 12px;
  color: rgba(0, 0, 0, 0.85);
  line-height: 22px;
  font-weight: bold;
  .drawer-title {
    font-size: 14px;
  }
}
.setting-drawer-block-checbox {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-top: 10px;
  margin-bottom: 20px;

  .setting-drawer-block-checbox-item {
    position: relative;
    margin-right: 16px;
    border-radius: 2px;
    cursor: pointer;

    img {
      width: 48px;
      height: 48px;
    }

    .custom-img {
      width: 48px;
      height: 38px;
      border-radius: 5px;
      box-shadow: 1px 1px 2px #898484;
    }

    .setting-drawer-block-checbox-selectIcon {
      position: absolute;
      top: 0;
      right: 0;
      width: 100%;
      height: 100%;
      padding-top: 15px;
      padding-left: 24px;
      color: #1890ff;
      font-weight: 700;
      font-size: 14px;
    }
  }
}

.drawer-item {
  color: rgba(0, 0, 0, 0.65);
  padding: 12px 0;
  font-size: 14px;

  .comp-style {
    float: right;
    margin: -3px 8px 0px 0px;
  }
}
</style>

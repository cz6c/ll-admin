<template>
  <!--
    材质：半透明 + blur；reduced-transparency 时在全局样式回退为实底
    CS 下高度/顶距由 antd.scss 扣 --cs-shell-bar-height，不靠抬 z-index 盖顶栏
  -->
  <a-drawer
    v-model:open="showSettings"
    root-class-name="settings-drawer"
    class="settings-drawer"
    :closable="false"
    placement="right"
    :width="300"
    :mask-style="maskStyle"
    title="系统配置"
  >
    <div class="drawer-item">
      <span>灰色模式</span>
      <span class="comp-style">
        <a-switch v-model:checked="greyVal" checked-children="开" un-checked-children="关" />
      </span>
    </div>

    <div class="drawer-item">
      <span>色弱模式</span>
      <span class="comp-style">
        <a-switch v-model:checked="weakVal" checked-children="开" un-checked-children="关" />
      </span>
    </div>

    <div class="drawer-item">
      <span>标签页</span>
      <span class="comp-style">
        <a-switch v-model:checked="tagsView" checked-children="开" un-checked-children="关" />
      </span>
    </div>

    <div class="drawer-item">
      <span>Logo</span>
      <span class="comp-style">
        <a-switch v-model:checked="sidebarLogo" checked-children="开" un-checked-children="关" />
      </span>
    </div>

    <a-divider />

    <a-space>
      <a-button type="primary" @click="saveSetting">
        <template #icon>
          <component :is="useRenderIcon('ant-design:file-add-outlined')" />
        </template>
        保存配置
      </a-button>
      <a-button @click="resetSetting">
        <template #icon>
          <component :is="useRenderIcon('ant-design:reload-outlined')" />
        </template>
        重置配置
      </a-button>
    </a-space>
  </a-drawer>
</template>

<script setup>
/**
 * 布局系统配置抽屉
 * 职责：灰色/色弱/标签页/Logo；主色由产品默认与 ConfigProvider 管理，不再在此改
 */
import { useSettingsStore } from "@/store/modules/settings";
import { WebStorage } from "@/utils/storage";
import $feedback from "@/utils/feedback";
import { useRenderIcon } from "@/hooks/useRenderIcon";

const settingsStore = useSettingsStore();
const showSettings = ref(false);
const storeSettings = computed(() => settingsStore);

/** 与 antd.scss .settings-drawer-mask 对齐 */
const maskStyle = {
  background: "rgba(0, 0, 0, 0.28)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)"
};

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

/**
 * 写入本地布局配置；仍带上 theme 以免覆盖掉既有主色缓存
 */
function saveSetting() {
  const layoutSetting = {
    theme: storeSettings.value.theme,
    greyVal: storeSettings.value.greyVal,
    weakVal: storeSettings.value.weakVal,
    tagsView: storeSettings.value.tagsView,
    sidebarLogo: storeSettings.value.sidebarLogo
  };
  new WebStorage("localStorage").setItem("layout-setting", layoutSetting);
  $feedback.message.success("配置已保存");
}

/** 清除本地布局缓存后立即刷新 */
function resetSetting() {
  new WebStorage("localStorage").removeItem("layout-setting");
  window.location.reload();
}
function openSetting() {
  showSettings.value = true;
}

defineExpose({
  openSetting
});
</script>

<style lang="scss" scoped>
.drawer-item {
  padding: 12px 0;
  font-size: 14px;

  .comp-style {
    float: right;
    margin: -3px 8px 0px 0px;
  }
}
</style>

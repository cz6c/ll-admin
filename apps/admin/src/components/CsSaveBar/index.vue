<!--
  CS 设置页底部保存条
  职责：固定底栏「重新加载 / 保存」，供应用设置页复用
-->
<script setup lang="ts">
defineOptions({ name: "CsSaveBar" });

defineProps<{
  /** 保存中禁用重载、按钮 loading */
  saving?: boolean;
}>();

const emit = defineEmits<{
  reload: [];
  save: [];
}>();
</script>

<template>
  <div class="cs-save-bar">
    <slot />
    <a-space>
      <a-button :disabled="saving" @click="emit('reload')">重新加载</a-button>
      <a-button type="primary" :loading="saving" @click="emit('save')">保存</a-button>
    </a-space>
  </div>
</template>

<style scoped lang="scss">
.cs-save-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 50px;
  padding: 0 16px;
  background: var(--bg-color);
  border-top: 1px solid var(--border-color);
}
</style>

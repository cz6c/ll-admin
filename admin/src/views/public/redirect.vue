<script setup lang="ts">
defineOptions({
  name: "Redirect"
});

const route = useRoute();
const router = useRouter();
const { params, query } = route;
const { path } = params;

router.replace({ path: "/" + path, query });
</script>

<template>
  <div />
</template>

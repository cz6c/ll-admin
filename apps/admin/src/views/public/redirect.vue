<script setup lang="ts">
import { RouterEnum } from "@/router";

defineOptions({
  name: RouterEnum.BASE_REDIRECT_NAME
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

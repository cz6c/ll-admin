<template>
  <div />
</template>
<script lang="ts" setup name="Redirect">
import { useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const { params, query } = route;
const { path } = params;

router.replace({ path: "/" + path, query });
</script>

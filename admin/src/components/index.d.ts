import BaseImage from "./BaseImage/index.vue";

declare module "@vue/runtime-core" {
  export interface GlobalComponents {
    BaseImage: typeof BaseImage;
  }
}

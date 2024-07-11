import { createPinia } from "pinia";
import type { App } from "vue";

const store = createPinia();
export default store;

export function setupStore(app: App<Element>) {
  app.use(store);
}

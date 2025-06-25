import type { App } from "vue";
import vAuth from "./modules/permission";
import vClickOutside from "./modules/click-outside";

export function setupGlobDirectives(app: App) {
  vAuth(app);
  vClickOutside(app);
}

import type { App } from "vue";
import { setupPermissionDirective } from "./modules/permission";

export function setupGlobDirectives(app: App) {
  setupPermissionDirective(app);
}

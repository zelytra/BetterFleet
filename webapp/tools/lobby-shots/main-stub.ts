// Stub for "@/main.ts": the real one runs keycloak init + createApp at import time, which kills a
// standalone render.
import { reactive } from "vue";

export const alertProvider = reactive({
  sendAlert: (alert: unknown) => console.log("[alert]", alert),
});

export { tsi18n as i18n } from "@/objects/i18n/index.ts";

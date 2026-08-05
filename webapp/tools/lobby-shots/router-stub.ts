// Stub for "@/router": the real one imports the keycloak store and the authed shell, both of which
// have import-time side effects. Keeps the shape HeaderComponent reads (routes[1].children, each
// with its nav icon) so the app's own sidebar renders exactly as it does in the app.
import { createRouter, createMemoryHistory } from "vue-router";
import fleet from "@/assets/icons/navigation.svg";
import config from "@/assets/icons/config.svg";

const blank = { template: "<div/>" };

export const routes = [
  { path: "/", name: "Auth", component: blank, meta: { displayInNav: false } },
  {
    path: "/fleet",
    name: "FleetManager",
    component: blank,
    meta: { displayInNav: false },
    children: [
      {
        path: "session",
        name: "Fleet",
        component: blank,
        meta: { icon: fleet, tooltip: "fleet", displayInNav: true },
      },
      {
        path: "config",
        name: "ConfigComponent",
        component: blank,
        meta: { icon: config, tooltip: "config", displayInNav: true },
      },
    ],
  },
];

export const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", name: "Report", component: blank },
    { path: "/session", name: "Fleet", component: blank },
    { path: "/config", name: "ConfigComponent", component: blank },
    { path: "/report", name: "ReportPage", component: blank },
  ],
});

export default router;

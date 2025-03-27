import { createWebHistory, createRouter } from "vue-router";
import Home from "@/components/Home.vue";
import { i18n } from "@/objects/i18n";
import Support from "@/components/Support.vue";
import Reports from "@/components/Reports.vue";
import Tutorial from "@/components/Tutorial.vue";

const { t } = i18n.global;

declare module "vue-router" {
  interface RouteMeta {
    displayInNav: boolean;
  }
}

export const routes = [
  {
    path: "/",
    name: t("nav.home"),
    component: Home,
    meta: {
      displayInNav: true,
    },
  },
  {
    path: "/support",
    name: t("nav.support"),
    component: Support,
    meta: {
      displayInNav: true,
    },
  },
  {
    path: "/tutorial",
    name: t("nav.documentation"),
    component: Tutorial,
    meta: {
      displayInNav: true,
    },
  },
  {
    path: "/reports",
    name: "report",
    component: Reports,
    meta: {
      displayInNav: false,
    },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;

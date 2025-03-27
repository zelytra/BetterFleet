import { createWebHistory, createRouter } from "vue-router";
import HomeComponent from "@/components/HomeComponent.vue";
import { i18n } from "@/objects/i18n";
import SupportComponent from "@/components/SupportComponent.vue";
import ReportsComponent from "@/components/ReportsComponent.vue";
import TutorialComponent from "@/components/TutorialComponent.vue";

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
    component: HomeComponent,
    meta: {
      displayInNav: true,
    },
  },
  {
    path: "/support",
    name: t("nav.support"),
    component: SupportComponent,
    meta: {
      displayInNav: true,
    },
  },
  {
    path: "/tutorial",
    name: t("nav.documentation"),
    component: TutorialComponent,
    meta: {
      displayInNav: true,
    },
  },
  {
    path: "/reports",
    name: "report",
    component: ReportsComponent,
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

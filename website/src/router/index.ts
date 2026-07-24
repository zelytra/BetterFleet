import { createWebHistory, createRouter } from "vue-router";
import HomeComponent from "@/components/HomeComponent.vue";
import SupportComponent from "@/components/SupportComponent.vue";
import ReportsComponent from "@/components/ReportsComponent.vue";
import TutorialComponent from "@/components/TutorialComponent.vue";
import StatisticsPage from "@/components/StatisticsPage.vue";

declare module "vue-router" {
  interface RouteMeta {
    displayInNav: boolean;
  }
}

export const routes = [
  {
    path: "/",
    name: "nav.home",
    component: HomeComponent,
    meta: {
      displayInNav: true,
    },
  },
  {
    path: "/support",
    name: "nav.support",
    component: SupportComponent,
    meta: {
      displayInNav: true,
    },
  },
  {
    path: "/tutorial",
    name: "nav.documentation",
    component: TutorialComponent,
    meta: {
      displayInNav: true,
    },
  },
  {
    path: "/statistics",
    name: "nav.statistics",
    component: StatisticsPage,
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
  {
    // Console players join a session lobby from their phone (#682). Lazy: the realtime lobby is
    // dead weight for every marketing visit, so it only loads when someone opens their invite link.
    path: "/s/:code",
    name: "session",
    component: () => import("@/components/session/MobileLobby.vue"),
    meta: {
      displayInNav: false,
    },
  },
  {
    // How a console player joins a session — the mobile CTA points here (#682).
    path: "/console",
    name: "console",
    component: () => import("@/components/ConsoleGuidePage.vue"),
    meta: {
      displayInNav: false,
    },
  },
  {
    // Catch-all 404 — must stay last so it only matches when nothing else did.
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("@/components/NotFoundPage.vue"),
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

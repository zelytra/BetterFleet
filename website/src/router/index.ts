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
  // Without this the browser keeps the old scroll offset across a route change, so following a link
  // from halfway down a page drops you halfway down the next one.
  scrollBehavior(to, _from, savedPosition) {
    // Back / forward: put people back where they were, which is what those buttons promise.
    if (savedPosition) {
      return savedPosition;
    }
    // Anchored links are left alone — the FAQ's "copy link" button hands out /support#eac, and the
    // target question opens itself on arrival. Forcing the top here would land nowhere near it.
    //
    // Whether the jump to the element itself lands could not be verified: the view renders inside a
    // `mode="out-in"` transition that currently never completes (issue #717), so on an in-app
    // navigation the target does not exist when this runs. What matters until that is fixed is that
    // a hash is never overridden with a scroll to the top.
    if (to.hash) {
      return { el: to.hash };
    }
    // A new page starts at its beginning, and instantly: the content has already been replaced, so
    // animating a long scroll afterwards only looks like a glitch (the global `scroll-behavior:
    // smooth` would otherwise apply here).
    return { top: 0, behavior: "instant" as ScrollBehavior };
  },
});

export default router;

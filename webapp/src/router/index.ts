import { createWebHistory, createRouter } from "vue-router";
import fleet from "@/assets/icons/navigation.svg";
import config from "@/assets/icons/config.svg";
import FleetComponent from "@/components/fleet/FleetComponent.vue";
import ConfigComponent from "@/components/fleet/ConfigComponent.vue";
import { keycloakStore } from "@/objects/stores/LoginStates.ts";
import AuthenticationComponent from "@/components/AuthenticationComponent.vue";
import FleetMenuNavigator from "@/components/FleetMenuNavigator.vue";
import ReportsComponent from "@/components/fleet/ReportsComponent.vue";

declare module "vue-router" {
  interface RouteMeta {
    icon?: string;
    role?: string;
    tooltip?: string;
    requiresAuth?: boolean;
    displayInNav: boolean;
  }
}

export const routes = [
  {
    path: "/",
    name: "Auth",
    component: AuthenticationComponent,
    meta: {
      displayInNav: false,
    },
  },
  {
    path: "/fleet",
    name: "FleetManager",
    component: FleetMenuNavigator,
    meta: {
      displayInNav: false,
    },
    children: [
      {
        path: "session",
        name: "Fleet",
        component: FleetComponent,
        meta: {
          icon: fleet,
          tooltip: "fleet",
          requiresAuth: true,
          displayInNav: true,
        },
      },
      {
        path: "config",
        name: "ConfigComponent",
        component: ConfigComponent,
        meta: {
          icon: config,
          tooltip: "config",
          requiresAuth: true,
          displayInNav: true,
        },
      },
      {
        path: "report",
        name: "Report",
        component: ReportsComponent,
        meta: {
          requiresAuth: true,
          displayInNav: false,
        },
      },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth) {
    if (
      !keycloakStore.isAuthenticated ||
      !keycloakStore.keycloak.authenticated
    ) {
      router.push("auth");
    }
  }
});

export default router;

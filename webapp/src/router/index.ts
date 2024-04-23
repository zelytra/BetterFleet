import {createWebHistory, createRouter} from "vue-router";
import Home from "@/components/fleet/Home.vue";
import fleet from "@/assets/icons/navigation.svg"
import config from "@/assets/icons/config.svg"
import sot from "@/assets/icons/logo.svg"
import Fleet from "@/components/fleet/Fleet.vue";
import Config from "@/components/fleet/Config.vue";
import {keycloakStore} from "@/objects/stores/LoginStates.ts";
import Authentication from "@/components/Authentication.vue";
import FleetMenuNavigator from "@/components/FleetMenuNavigator.vue";

declare module 'vue-router' {
  interface RouteMeta {
    icon?: string,
    role?: string,
    tooltip?: string
    requiresAuth?: boolean
    displayInNav: boolean
  }
}

export const routes = [
  {
    path: "/",
    name: "Auth",
    component: Authentication,
    meta: {
      icon: sot,
      displayInNav: false
    }
  },
  {
    path: "/fleet",
    name: "FleetManager",
    component: FleetMenuNavigator,
    meta: {
      displayInNav: false
    },
    children: [
      {
        path: "home",
        name: "Home",
        component: Home,
        meta: {
          icon: sot,
          tooltip: 'home',
          requiresAuth: true,
          displayInNav: true
        }
      },
      {
        path: "session",
        name: "Fleet",
        component: Fleet,
        meta: {
          icon: fleet,
          tooltip: 'fleet',
          requiresAuth: true,
          displayInNav: true
        }
      },
      {
        path: "config",
        name: "Config",
        component: Config,
        meta: {
          icon: config,
          tooltip: 'config',
          requiresAuth: true,
          displayInNav: true
        }
      }
    ]
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from) => {
  if (to.meta.requiresAuth) {
    if (!keycloakStore.isAuthenticated || !keycloakStore.keycloak.authenticated) {
      router.push('auth')
    }
  }
})

export default router;

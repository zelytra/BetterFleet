import {createWebHistory, createRouter} from "vue-router";
import Home from "@/components/Home.vue";
import fleet from "@/assets/icons/navigation.svg"
import config from "@/assets/icons/config.svg"
import sot from "@/assets/icons/logo.svg"
import Fleet from "@/components/Fleet.vue";
import Config from "@/components/Config.vue";
import i18n from "@/objects/i18n";

declare module 'vue-router' {
  interface RouteMeta {
    icon?: string,
    role?: string,
    tooltip?: string
  }
}

const {t} = i18n.global;

export const routes = [
  {
    path: "/",
    name: "Home",
    component: Home,
    meta: {
      icon: sot,
      tooltip: t('tooltips.navbar.home')
    }
  },
  {
    path: "/fleet",
    name: "Fleet",
    component: Fleet,
    meta: {
      icon: fleet,
      tooltip: t('tooltips.navbar.fleet')
    }
  }, {
    path: "/config",
    name: "Config",
    component: Config,
    meta: {
      icon: config,
      tooltip: t('tooltips.navbar.config')
    }
  },

];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;

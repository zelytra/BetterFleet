import {createWebHistory, createRouter} from "vue-router";
import Home from "@/components/Home.vue";
import fleet from "@/assets/icons/boat.svg"
import config from "@/assets/icons/config.svg"
import sot from "@/assets/icons/sot.svg"
import Fleet from "@/components/Fleet.vue";
import Config from "@/components/Config.vue";

declare module 'vue-router' {
    interface RouteMeta {
        icon?: string,
        role?: string
    }
}

export const routes = [
    {
        path: "/",
        name: "Home",
        component: Home,
        meta: {icon: sot}
    },
    {
        path: "/fleet",
        name: "Fleet",
        component: Fleet,
        meta: {
            icon: fleet
        }
    }, {
        path: "/config",
        name: "Config",
        component: Config,
        meta: {
            icon: config
        }
    },

];

export const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;

import {createWebHistory, createRouter} from "vue-router";
import Home from "@/components/Home.vue";
import {i18n} from "@/objects/i18n";
import Support from "@/components/Support.vue";

const {t} = i18n.global;

export const routes = [
    {
        path: "/",
        name: t('nav.home'),
        component: Home,
    },
    {
        path: "/support",
        name: t('nav.support'),
        component: Support,
    },
];

export const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;

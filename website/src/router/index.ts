import {createWebHistory, createRouter} from "vue-router";
import Home from "@/components/Home.vue";
import {i18n} from "@/objects/i18n";

const {t} = i18n.global;

export const routes = [
    {
        path: "/",
        name: t('nav.home'),
        component: Home,
    },
    {
        path: "/documentation",
        name: t('nav.documentation'),
        component: Home,
    },
    {
        path: "/support",
        name: t('nav.support'),
        component: Home,
    },
];

export const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;

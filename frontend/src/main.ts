import { createApp } from 'vue'
import "@assets/style.scss";
import "@assets/font.scss";
import App from './App.vue'
import router from "@/router";

const app = createApp(App);
app.directive('click-outside', {
    mounted(el, binding) {
        el.clickOutsideEvent = function (event: any) {
            if (!(el === event.target || el.contains(event.target))) {
                binding.value(event, el);
            }
        };
        window.requestAnimationFrame(() => {
            document.body.addEventListener('click', el.clickOutsideEvent)
        });
    },
    unmounted(el) {
        document.body.removeEventListener('click', el.clickOutsideEvent);
    }
});
app.use(router);
app.mount('#app')
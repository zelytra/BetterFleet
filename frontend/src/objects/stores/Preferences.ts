import {reactive, readonly} from "vue";


export const UserStore = reactive({
    user: {name: "Zelytra", lang: 'fr'},
    init() {
        //TODO Call web cache to load variable of the user
    }
});
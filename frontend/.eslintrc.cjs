/* eslint-env node */
module.exports = {
  root: true,
  extends: [
    'plugin:vue/vue3-recommended',
  ],
  rules: {
    // Disable the 'vue/no-use-v-if-with-v-for' rule
    "vue/no-use-v-if-with-v-for": "off",
    "vue/multi-word-component-names": "off"
  },
};

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
      {
        find: "@assets",
        replacement: fileURLToPath(new URL("./src/assets", import.meta.url)),
      },
      {
        find: "@components",
        replacement: fileURLToPath(
          new URL("./src/components", import.meta.url),
        ),
      },
      {
        find: "@vue/runtime-core",
        replacement: "@vue/runtime-core/dist/runtime-core.esm-bundler.js",
      },
    ],
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler", // or "modern"
        // $lap / $palm reach every <style lang="scss"> block without each one importing them. They
        // have to be Sass variables rather than the CSS custom properties in style.scss, because a
        // custom property cannot be read inside a @media query — it is resolved on elements, and a
        // media query has no element to resolve against.
        additionalData: '@use "@/assets/breakpoints" as *;',
      },
    },
  },
});

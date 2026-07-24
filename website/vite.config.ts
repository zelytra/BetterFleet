import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // Mirror production's topology in dev. Live, the site calls betterfleet.fr/api — same origin,
    // so CORS never applies. Pointing VITE_BACKEND_HOST at /api and proxying it to the local
    // backend gives dev the same shape, instead of cross-origin calls the backend's CORS config
    // doesn't answer (#654) — which silently blanked every API-fed widget in dev.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        // Upgrade WebSocket connections too, so the mobile lobby's /api/sessions socket works in dev
        // (#682). Production is same-origin, so this only matters for the proxy.
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
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

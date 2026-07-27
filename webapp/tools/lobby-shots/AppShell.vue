<!--
  The authed shell around the lobby, copied from FleetMenuNavigator's template and styles. The real
  one cannot be mounted here: it polls Tauri for the game state every 400ms and leaves the session on
  unmount. This keeps its markup — the app's own HeaderComponent, the same .app-section/.content
  layout — without the native plumbing.
-->
<template>
  <section class="app-section">
    <HeaderComponent />
    <section class="content">
      <div class="lobby-wrapper">
        <FleetLobby :session="session" />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { PropType } from "vue";
import HeaderComponent from "@/components/global/HeaderComponent.vue";
import FleetLobby from "@/components/fleet/session/FleetLobby.vue";
import { Fleet } from "@/objects/fleet/Fleet.ts";

defineProps({
  session: { type: Object as PropType<Fleet>, required: true },
});
</script>

<style scoped lang="scss">
.app-section {
  display: flex;

  .content {
    height: 100vh;
    overflow: hidden;
    overflow-y: auto;
    padding: 12px;
    width: 100%;
    box-sizing: border-box;
    position: relative;
  }

  // FleetComponent's own wrapper, which is what FleetLobby's height:100% resolves against.
  .lobby-wrapper {
    height: 100%;
    box-sizing: border-box;
  }
}
</style>

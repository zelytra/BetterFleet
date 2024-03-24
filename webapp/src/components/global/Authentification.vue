<template>
  <section>
    <p>your not auth</p>
    <button @click="authUser()">AUTH</button>
  </section>
</template>

<script setup lang="ts">

import {keycloakStore} from "@/objects/stores/LoginStates.ts";

function authUser() {

  if (!keycloakStore.isKeycloakInit || !keycloakStore.keycloak.authenticated) {
    keycloakStore.init(window.location.origin);
  }
}
</script>

<style scoped lang="scss">

</style>
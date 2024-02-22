<template>
  <section class="choice-wrapper">
    <div class="choice join">
      <h1>Join a session</h1>
      <input
        v-model="sessionsId"
        type="text"
      >
      <button @click="">
        Join
      </button>
    </div>
    <div class="choice create">
      <h1>Create a session</h1>
      <button @click="">
        Create
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import {ref} from "vue";

const sessionsId = ref<string>("")


</script>

<style scoped lang="scss">
.choice-wrapper {
  display: flex;
  justify-content: space-between;

}
</style>
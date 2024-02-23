<template>
  <section class="choice-wrapper">
    <SessionCard :title="t('session.choice.createSession')">
      <p>{{ t("session.choice.createComment") }}</p>
    </SessionCard>
    <SessionCard :title="t('session.choice.joinSession')">
      <p>{{ t("session.choice.joinComment") }}</p>
    </SessionCard>
  </section>
</template>

<script setup lang="ts">
import SessionCard from "@/vue/templates/SessionCard.vue";
import {useI18n} from "vue-i18n";

const {t} = useI18n();


</script>

<style scoped lang="scss">
.choice-wrapper {
  display: flex;
  justify-content: center;
  gap: 10%;
  height: 100%;
  align-items: center;

}
</style>
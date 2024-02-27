<template>
  <section class="choice-wrapper">
    <SessionCard :title="t('session.choice.createSession')">
      <p>{{ t("session.choice.createComment") }}</p>
    </SessionCard>
    <SessionCard
      :title="t('session.choice.joinSession')"
      :background="'linear-gradient(270deg, rgba(50, 144, 212, 0.20) 0%, rgba(50, 144, 212, 0.07) 108.45%)'"
      @click="isModalOpen = true"
    >
      <p>{{ t("session.choice.joinComment") }}</p>
    </SessionCard>
    <modale-template v-model:is-modal-open="isModalOpen">
      <p>test</p>
    </modale-template>
  </section>
</template>

<script setup lang="ts">
import SessionCard from "@/vue/templates/SessionCard.vue";
import { useI18n } from "vue-i18n";
import { Fleet } from "@/objects/Fleet.ts";
import { PropType, ref } from "vue";
import ModaleTemplate from "@/vue/templates/ModaleTemplate.vue";

const { t } = useI18n();
const isModalOpen = ref<boolean>(false);
defineProps({
  session: { type: Object as PropType<Fleet> },
});
</script>

<style scoped lang="scss">
.choice-wrapper {
  display: flex;
  justify-content: center;
  gap: 10%;
  height: 100%;
  align-items: center;
  transition: all;
}
</style>

<template>
  <section class="choice-wrapper">
    <FleetSessionNavigator />
    <div class="side-container">
      <MenuActionBar
        v-model:is-modal-open="isModalOpen"
        @create-session="createSession"
      />
    </div>
  </section>
  <JoinSessionModal
    v-model:is-modal-open="isModalOpen"
    @validate="joinSession"
  />
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { PropType, ref } from "vue";
import { AlertType } from "@/vue/alert/Alert.ts";
import { alertProvider } from "@/main.ts";
import FleetSessionNavigator from "@/vue/fleet/FleetSessionNavigator.vue";
import JoinSessionModal from "@/components/fleet/session/menu/JoinSessionModal.vue";
import MenuActionBar from "@/components/fleet/session/menu/MenuActionBar.vue";

const { t } = useI18n();
const isModalOpen = ref<boolean>(false);

const props = defineProps({
  session: { type: Object as PropType<Fleet>, required: true },
});

async function joinSession(sessionId?: string) {
  if (!sessionId || sessionId.length == 0) {
    alertProvider.sendAlert({
      content: t("alert.emptySession.content"),
      title: t("alert.emptySession.title"),
      type: AlertType.WARNING,
    });
    return;
  }
  await props.session.joinSession(sessionId || "");
  isModalOpen.value = false;
}

function createSession() {
  props.session.joinSession("");
}
</script>

<style scoped lang="scss">
.choice-wrapper {
  display: flex;
  justify-content: center;
  gap: 12px;
  height: 100%;
  transition: all;

  .side-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    gap: 17px;
    width: 325px;
    box-sizing: border-box;
    max-height: calc(100vh);
    overflow: hidden;
    overflow-y: auto;
  }
}
</style>

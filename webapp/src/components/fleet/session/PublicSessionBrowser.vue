<template>
  <div class="browser">
    <div class="toolbar">
      <single-select
        class="filter"
        :data="filterData"
        @update:data="onFilterChange"
      />
      <InputText
        v-model:input-value="store.state.query"
        class="search"
        :placeholder="t('session.searchPlaceholder')"
      />
    </div>
    <div v-if="visible.length" class="list">
      <SessionRow
        v-for="session in visible"
        :key="session.sessionId"
        :session="session"
        @join="$emit('join', session.sessionId)"
      />
    </div>
    <div v-else class="empty">
      <h2>{{ t("session.empty.title") }}</h2>
      <p>{{ t("session.empty.comment") }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive } from "vue";
import { useI18n } from "vue-i18n";
import SingleSelect from "@/vue/form/SingleSelect.vue";
import InputText from "@/vue/form/InputText.vue";
import SessionRow from "@/components/fleet/session/SessionRow.vue";
import { PublicSessionsStore } from "@/objects/fleet/PublicSessionsStore.ts";
import { SessionFilter } from "@/objects/fleet/PublicSessionsFilter.ts";
import { SingleSelectInterface } from "@/vue/form/Inputs.ts";
import lockIcon from "@/assets/icons/lock.svg";
import lockOpenIcon from "@/assets/icons/lock_open.svg";

const { t } = useI18n();
defineEmits(["join"]);

const store = PublicSessionsStore;
const visible = computed(() => store.visible);

// Open padlock = public, closed padlock = private (same language as the session rows); "All"
// carries no padlock at all.
const filterData = reactive<SingleSelectInterface>({
  data: [
    { id: "all", display: t("session.filter.all"), image: "" },
    { id: "public", display: t("session.filter.public"), image: lockOpenIcon },
    { id: "private", display: t("session.filter.private"), image: lockIcon },
  ],
  selectedValue: {
    id: "all",
    display: t("session.filter.all"),
    image: "",
  },
});

function onFilterChange(data: SingleSelectInterface): void {
  store.state.filter = (data.selectedValue?.id as SessionFilter) ?? "all";
}

onMounted(() => {
  store.refresh();
  store.connectStream();
});
onUnmounted(() => store.disconnect());
</script>

<style scoped lang="scss">
.browser {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;

  .toolbar {
    display: flex;
    gap: 12px;
    align-items: center;

    .filter {
      flex-shrink: 0;
    }

    .search {
      flex: 1;
    }
  }

  .list {
    flex: 1;
    min-height: 0;
    background: var(--secondary-background);
    padding: 8px;
    border-radius: 5px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 12px;
    text-align: center;
    color: var(--secondary-text);

    h2 {
      color: var(--primary);
      font-family: BrushTip, sans-serif;
      font-size: 40px;
    }
  }
}
</style>

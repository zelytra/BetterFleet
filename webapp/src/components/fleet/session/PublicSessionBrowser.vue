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
    <TransitionGroup
      v-if="visible.length"
      appear
      name="row"
      tag="div"
      class="list"
    >
      <SessionRow
        v-for="(session, index) in visible"
        :key="session.directoryId"
        :session="session"
        :style="{ '--row-index': index }"
        @join="$emit('join', session.sessionId)"
        @code="$emit('code')"
      />
    </TransitionGroup>
    <Transition v-else appear name="fade">
      <div class="empty">
        <h2>{{ t("session.empty.title") }}</h2>
        <p>{{ t("session.empty.comment") }}</p>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
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
defineEmits(["join", "code"]);

const store = PublicSessionsStore;
const visible = computed(() => store.visible);

// Open padlock = public, closed padlock = private (same language as the session rows); "All"
// carries no padlock at all.
const filterData = ref<SingleSelectInterface>({
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

// The select emits the pick without touching what it was given, so applying it here
// is what both moves the label and drives the list.
function onFilterChange(data: SingleSelectInterface): void {
  filterData.value = data;
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

  // Rows arrive one after another rather than the whole list landing at once — the list is
  // refreshed by the SSE, so this fires on the first load and for genuinely new sessions only
  // (keyed rows that are already there are left alone).
  .row-enter-active {
    transition:
      opacity 220ms ease,
      transform 220ms ease;
    // Capped, or a busy directory would still be dealing itself out seconds later.
    transition-delay: min(calc(var(--row-index, 0) * 45ms), 400ms);
  }

  .row-enter-from {
    opacity: 0;
    transform: translateY(8px);
  }

  .row-leave-active {
    transition: opacity 160ms ease;
  }

  .row-leave-to {
    opacity: 0;
  }

  // A session going private, or the busiest one filling up, reorders the list: slide instead of
  // teleporting.
  .row-move {
    transition: transform 260ms ease;
  }

  .fade-enter-active {
    transition: opacity 260ms ease;
  }

  .fade-enter-from {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .row-enter-active,
    .row-leave-active,
    .row-move,
    .fade-enter-active {
      transition: none;
    }
  }
}
</style>

<template>
  <div
    class="collapse-container"
    :id="id"
    @click="deploy = !deploy"
    :class="{ deploy: deploy }"
  >
    <div class="header">
      <h1>{{ title }}</h1>
      <div class="copy-wrapper">
        <img src="@/assets/icons/link.svg" alt="link" @click.stop="copyLink" />
        <p class="copy" v-if="displayCopy">{{ t("faq.copy") }}</p>
      </div>
      <img src="@/assets/icons/arrow.svg" alt="arrow" />
    </div>
    <div class="content" @click.stop>
      <div class="custom-content">
        <slot />
      </div>
      <p class="see-more">
        {{ t("faq.more") }}
        <a href="http://discord.betterfleet.fr" target="_blank">Discord</a>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { onMounted, ref } from "vue";

const { t } = useI18n();
const deploy = ref<boolean>(false);
const displayCopy = ref<boolean>(false);
const props = defineProps({
  title: String,
  id: String,
  url: String,
});

function copyLink() {
  navigator.clipboard.writeText(
    "https://" + window.location.host + "/" + props.url + "#" + props.id,
  );
  displayCopy.value = true;
  setTimeout(() => {
    displayCopy.value = false;
  }, 1000);
}

onMounted(() => {
  if (window.location.href.includes("#" + props.id)) {
    deploy.value = true;
  }
});
</script>

<style scoped lang="scss">
.collapse-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-height: 44px;
  overflow: hidden;
  border-radius: 5px;

  &.deploy {
    .header {
      background-color: #32d49980;

      img[alt="arrow"] {
        transform: rotate(0);
      }
    }

    max-height: 500px;
  }

  .header {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    box-sizing: border-box;
    width: 100%;
    background: var(--secondary-background);
    height: 44px;
    position: relative;

    h1 {
      font-size: 19px;
    }

    &:hover {
      background-color: #32d49980;
    }

    img[alt="arrow"] {
      position: absolute;
      right: 15px;
      top: 14px;
      transform: rotate(-90deg);
    }

    img[alt="link"] {
      width: 22px;
    }

    .copy-wrapper {
      display: flex;
      position: relative;

      p.copy {
        background: var(--primary);
        padding: 4px;
        border-radius: 5px;
        position: absolute;
        top: 50%;
        left: 25px;
        transform: translate(0, -50%);
        white-space: nowrap;
      }
    }
  }

  .content {
    width: 100%;
    padding: 12px 12px 54px 12px;
    box-sizing: border-box;
    background: var(--secondary-background);
    position: relative;
    min-height: 90px;
    display: flex;
    flex-direction: column;
    gap: 12px;

    .custom-content {
      background: #202228;
      padding: 12px;
      border-radius: 5px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 390px;
      overflow: hidden;
      overflow-y: auto;
    }

    p.see-more {
      position: absolute;
      bottom: 4px;
      white-space: nowrap;
      left: 50%;
      color: var(--secondary-text);
      transform: translate(-50%, 0);

      a {
        color: var(--primary);

        &:hover {
          text-decoration: underline var(--primary);
        }
      }
    }
  }
}
</style>

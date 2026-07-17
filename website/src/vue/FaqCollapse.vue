<template>
  <div
    :id="id"
    class="collapse-container"
    :class="{ deploy: deploy }"
    @click="deploy = !deploy"
  >
    <div class="header">
      <h1>{{ title }}</h1>
      <div class="copy-wrapper">
        <img src="@/assets/icons/link.svg" alt="link" @click.stop="copyLink" />
        <p v-if="displayCopy" class="copy">{{ t("faq.copy") }}</p>
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

  // An answer that runs to 300px in a desktop-width column needs far more than that on a phone, and
  // the open state is capped at 500px with overflow hidden — so the bottom of the longer answers
  // would simply be cut off, silently, with no scrollbar to hint at it. The cap exists to animate
  // the open/close; it only has to beat the tallest answer.
  @media (max-width: $lap) {
    &.deploy {
      max-height: 1400px;
    }

    .content {
      // The 54px of bottom padding here reserves room for the absolutely-placed "see more" line,
      // which now sits in the flow instead.
      padding: 12px 12px 16px;

      .custom-content {
        // Same trap one level down: this one at least scrolls, but a 390px window onto a phone-height
        // answer is a keyhole.
        max-height: none;
        overflow: visible;
      }

      // Centred with left: 50% / translate(-50%) and held on one line by white-space: nowrap, so in a
      // narrow column it grows wider than its container and hangs off *both* edges — at 375px the
      // Discord link sat 224px past the right of the screen.
      p.see-more {
        position: static;
        transform: none;
        white-space: normal;
        text-align: center;
        margin-top: 4px;
      }
    }

    .header h1 {
      font-size: 16px;
      // The questions are full sentences; on one line they were being cut mid-word.
      line-height: 1.25;
    }
  }

  @media (max-width: $palm) {
    // The collapsed bar is a fixed 44px, which fits a one-line question. These are sentences, and at
    // 375px they take two.
    max-height: 64px;

    .header {
      height: auto;
      min-height: 64px;
      padding: 8px 10px;

      h1 {
        font-size: 15px;
      }
    }
  }
}
</style>

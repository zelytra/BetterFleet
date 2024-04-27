<template>
  <div class="collapse-container" :id="id" @click="deploy = !deploy" :class="{deploy:deploy}">
    <div class="header">
      <h1>{{ title }}</h1>
      <img src="@/assets/icons/link.svg" alt="link" @click.prevent="copyLink()"/>
      <img src="@/assets/icons/arrow.svg" alt="arrow"/>
    </div>
    <div class="content">
      <slot/>
      <p class="see-more">{{ t('faq.more') }} <a href="http://discord.betterfleet.fr" target="_blank">Discord</a></p>
    </div>
  </div>
</template>

<script setup lang="ts">
import {useI18n} from "vue-i18n";
import {onMounted, ref} from "vue";

const {t} = useI18n()
const deploy = ref<boolean>(false)
const props = defineProps({
  title: String,
  id: String
})

function copyLink() {
  navigator.clipboard.writeText("https://" + window.location.host + "/support#" + props.id);
}

onMounted(() => {
  if (window.location.href.includes("#" + props.id)) {
    deploy.value = true;
  }
})
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
      background: var(--primary);

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
      background: var(--primary);
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
  }

  .content {
    width: 100%;
    padding: 24px 24px 54px 24px;
    box-sizing: border-box;
    background: var(--secondary-background);
    position: relative;
    min-height: 90px;
    display: flex;
    flex-direction: column;
    gap: 12px;

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
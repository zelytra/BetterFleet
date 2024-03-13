<template>
  <footer>
    <div class="side-content">
      <img src="@/assets/icons/full-logo.svg" alt="full logo"/>
      <p>{{t('footer.content')}}</p>
    </div>
    <div class="side-content"></div>
  </footer>
</template>

<script setup lang="ts">
import {useI18n} from "vue-i18n";

const {t} = useI18n()
</script>

<style scoped lang="scss">
footer {
  margin-top: 300px;
  height: 460px;
  background: url("@/assets/backgrounds/footer.svg") 0 0/100% 100%;
  background-size: cover;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 32px;
  box-sizing: border-box;

  .side-content{
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    margin-top: 100px;
  }
}
</style>
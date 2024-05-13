<template>
  <section class="report">
    <ParameterPart>
      <div class="report-wrapper">
        <h2>{{ t('report.faq.title') }}</h2>
        <p>{{ t('report.faq.content') }}</p>
        <div>
          <a href="https://discord.gg/sHPp5CPxf2" target="_blank">
            <PirateButton :label="t('report.faq.button.discord')"/>
          </a>
          <a href="https://betterfleet.fr/support" target="_blank">
            <PirateButton :label="t('report.faq.button.faq')"/>
          </a>
        </div>
      </div>
    </ParameterPart>
    <ParameterPart>
      <div class="report-wrapper">
        <h2>{{ t('report.bug.title') }}</h2>
        <p>{{ t('report.bug.content1') }}</p>
        <p>{{ t('report.bug.content2') }}</p>
        <div class="text-area-wrapper">
          <textarea maxlength="500" v-model="reportMessage"/>
          <p>{{ reportMessage.length }}/500</p>
        </div>
        <PirateButton :label="t('report.bug.button')" @on-button-click="sendReport()"/>
      </div>
    </ParameterPart>
  </section>
</template>

<script setup lang="ts">

import ParameterPart from "@/vue/templates/ParameterPart.vue";
import {useI18n} from "vue-i18n";
import PirateButton from "@/vue/form/PirateButton.vue";
import {ref} from "vue";
import {BugReport, ReportInterface} from "@/objects/report/Report.ts";

const {t} = useI18n()
const reportMessage = ref("")

function sendReport() {
  const report: ReportInterface = {
    device: "OS : Windows 11\nLocal Date: 12/12/1212\nRandom Data : Random data",
    logs: "[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF\n[HH:MM:SS-DD-MM-YYYY] [RUST] Server found : 8.8.8.8\n[16:46:35-26-04-2024] [FRONTEND] User join a session ABCDEF",
    message: " Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla interdum lorem non luctus hendrerit. Donec ex leo, congue ac erat sit amet, auctor euismod arcu. Nunc interdum risus ligula, a auctor ipsum ultrices vitae. Integer sed orci vitae urna cursus tempus. Duis vehicula nunc vitae turpis euismod egestas. Proin varius mattis nulla, nec scelerisque ante imperdiet ut. Etiam in sapien quis felis dapibus sodales vitae a dolor. Sed ac porta ex. Sed rutrum ut mi ut sodales. Pellentesque sit amet ex aliquet tellus tincidunt pretium. Sed id lorem congue, molestie libero vitae, elementum neque. Nam quis scelerisque purus, a aliquam nulla.\n" +
        "\n" +
        "Vivamus sollicitudin rutrum tristique. Fusce pellentesque enim dapibus felis porta, sed accumsan velit eleifend. Sed viverra nisi erat, ut aliquam enim malesuada vitae. Interdum et malesuada fames ac ante ipsum primis in faucibus. Etiam eu sodales eros. Mauris ut bibendum nunc. Mauris ut pulvinar urna, id porta felis. Nunc ultrices varius magna quis tempor. "
  }
  new BugReport(report).sendReport()
}
</script>

<style scoped lang="scss">
.report {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  height: 100%;

  .report-wrapper {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 40px;

    h2 {
      position: relative;

      &:after {
        display: flex;
        position: absolute;
        content: '';
        bottom: -10px;
        left: 50%;
        transform: translate(-50%, 0);
        background: url("@assets/backgrounds/underline.svg") no-repeat;
        width: 100px;
        height: 12px;
      }
    }

    p {
      text-align: center;
    }

    .text-area-wrapper {
      width: 100%;
      position: relative;

      textarea {
        width: 100%;
        height: 120px;
        box-sizing: border-box;
        border: 2px solid var(--primary);
        border-radius: 4px;
        background-color: var(--secondary-background);
        font-size: 16px;
        resize: none;
        padding: 6px;

        &:focus {
          outline: none;
        }
      }

      p {
        color: var(--primary);
        font-size: 12px;
        position: absolute;
        bottom: -15px;
        right: 0;
      }
    }
  }
}
</style>
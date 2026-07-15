<template>
  <section class="report">
    <ParameterPart>
      <div class="report-wrapper">
        <h2>{{ t("report.faq.title") }}</h2>
        <p>{{ t("report.faq.content") }}</p>
        <div>
          <a href="https://discord.gg/sHPp5CPxf2" target="_blank">
            <PirateButton :label="t('report.faq.button.discord')" />
          </a>
          <a href="https://betterfleet.fr/support" target="_blank">
            <PirateButton :label="t('report.faq.button.faq')" />
          </a>
        </div>
      </div>
    </ParameterPart>
    <ParameterPart>
      <div class="report-wrapper">
        <h2>{{ t("report.bug.title") }}</h2>
        <p>{{ t("report.bug.content1") }}</p>
        <p>{{ t("report.bug.content2") }}</p>
        <div class="text-area-wrapper">
          <textarea v-model="reportMessage" maxlength="500" />
          <p>{{ reportMessage.length }}/500</p>
        </div>
        <PirateButton
          :label="t('report.bug.button')"
          @on-button-click="sendReport()"
        />
      </div>
    </ParameterPart>
    <ParameterPart>
      <div class="report-wrapper">
        <h2>Server detection diagnostic</h2>
        <p>
          Captures the game's UDP flows for ~20s to debug server detection
          (issue #364). Run it once in the main menu and once in game, then copy
          and share each result.
        </p>
        <div class="diag-buttons">
          <PirateButton
            :label="diagRunning ? 'Capturing…' : 'Capture (main menu)'"
            @on-button-click="runDiagnostic('main menu')"
          />
          <PirateButton
            :label="diagRunning ? 'Capturing…' : 'Capture (in game)'"
            @on-button-click="runDiagnostic('in game')"
          />
        </div>
        <div v-if="diagOutput" class="text-area-wrapper">
          <textarea readonly :value="diagOutput" />
          <PirateButton label="Copy" @on-button-click="copyDiag()" />
        </div>
      </div>
    </ParameterPart>
  </section>
</template>

<script setup lang="ts">
import ParameterPart from "@/vue/templates/ParameterPart.vue";
import { useI18n } from "vue-i18n";
import PirateButton from "@/vue/form/PirateButton.vue";
import { inject, ref } from "vue";
import { BugReport, ReportInterface } from "@/objects/report/Report.ts";
import { AlertProvider, AlertType } from "@/vue/alert/Alert.ts";
import { invoke } from "@tauri-apps/api/tauri";

const { t } = useI18n();
const reportMessage = ref("");
const alerts = inject<AlertProvider>("alertProvider");
const diagRunning = ref(false);
const diagOutput = ref("");

async function runDiagnostic(note: string) {
  if (diagRunning.value) return;
  diagRunning.value = true;
  diagOutput.value = "";
  try {
    const report = await invoke("run_server_diagnostic", {
      durationSecs: 20,
      note,
    });
    diagOutput.value = JSON.stringify(report, null, 2);
  } catch (error) {
    diagOutput.value = "Error: " + String(error);
  } finally {
    diagRunning.value = false;
  }
}

function copyDiag() {
  navigator.clipboard.writeText(diagOutput.value);
  alerts?.sendAlert({
    title: "Copied to clipboard",
    content: "",
    type: AlertType.VALID,
  });
}

async function sendReport() {
  if (reportMessage.value.length == 0) {
    alerts?.sendAlert({
      title: t("alert.report.emptyMessage.title"),
      content: t("alert.report.emptyMessage.content"),
      type: AlertType.WARNING,
    });
    return;
  }

  const report: ReportInterface = {
    device: "",
    logs: "",
    message: reportMessage.value,
  };
  await invoke("get_logs", { maxLines: 5000 }).then((logs) => {
    report.logs = logs as string;
  });

  await invoke("get_system_info").then((system) => {
    report.device = system as string;
  });

  new BugReport(report).sendReport();
  alerts?.sendAlert({
    title: t("alert.report.send.title"),
    content: "",
    type: AlertType.VALID,
  });
  reportMessage.value = "";
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

    .diag-buttons {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;
    }

    h2 {
      position: relative;

      &:after {
        display: flex;
        position: absolute;
        content: "";
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

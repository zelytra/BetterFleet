import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";

vi.mock("@tauri-apps/plugin-http", async () =>
  (await import("@/test/harness/tauri.ts")).httpMock(),
);
vi.mock("@tauri-apps/plugin-log", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);
vi.mock("@tauri-apps/api/core", async () =>
  (await import("@/test/harness/tauri.ts")).invokeMock(),
);
vi.mock("@/main.ts", async () =>
  (await import("@/test/harness/tauri.ts")).mainMock(),
);
vi.mock("@/objects/stores/LoginStates.ts", async () =>
  (await import("@/test/harness/tauri.ts")).keycloakMock(),
);
// The component only reads route.query (the guided-diagnostic flag), so a full router is noise.
const { routeQuery } = vi.hoisted(() => ({
  routeQuery: {} as Record<string, string>,
}));
vi.mock("vue-router", () => ({ useRoute: () => ({ query: routeQuery }) }));

import ReportsComponent from "@/components/fleet/ReportsComponent.vue";
import {
  attachDiagnostic,
  DIAGNOSTIC_HEADER,
  DIAGNOSTIC_TRUNCATED,
  MESSAGE_MAX_LENGTH,
} from "@/objects/report/Report.ts";
import { fakeBackend, settle } from "@/test/harness/FakeBackend.ts";
import {
  installFakeTransports,
  rustResponses,
  sentAlerts,
} from "@/test/harness/tauri.ts";
import fr from "@/assets/locales/fr.json";

const i18n = createI18n({
  legacy: false,
  locale: "fr",
  messages: { fr } as any,
});

// What run_server_diagnostic answers: the shape Rust's DiagnosticReport serializes to.
const flow = {
  local_port: 59230,
  remote_ip: "20.216.148.125",
  remote_port: 30101,
  packets: 1247,
  bytes: 151176,
  inbound: 600,
  outbound: 647,
  plausible_sot_port: true,
  first_seen_ms: 8,
  last_seen_ms: 20008,
};
const capture = {
  note: "in game (guided)",
  game_status: "Started",
  pid: 4242,
  duration_ms: 20000,
  main_menu_port: 3000,
  udp_ports_netstat2: [59230],
  udp_ports_powershell: [59230],
  total_packets: 1247,
  distinct_flows: 1,
  top_candidates: [flow],
  flows: [flow],
};

function mountReports() {
  return mount(ReportsComponent, {
    global: {
      plugins: [i18n],
      provide: {
        alertProvider: {
          sendAlert: (alert: never) => sentAlerts.push(alert),
        },
      },
    },
  });
}

function button(wrapper: ReturnType<typeof mountReports>, label: string) {
  const match = wrapper.findAll("button").find((b) => b.text() === label);
  if (!match) throw new Error("no button labeled " + label);
  return match;
}

const send = (wrapper: ReturnType<typeof mountReports>) =>
  button(wrapper, fr.report.bug.button).trigger("click");

describe("the bug report carries the diagnostic capture", () => {
  beforeEach(() => {
    installFakeTransports();
    for (const key of Object.keys(routeQuery)) delete routeQuery[key];
    rustResponses.set("get_logs", "log line 1\nlog line 2");
    rustResponses.set("get_system_info", "=> System: test rig");
  });

  it("attaches the guided capture to the POSTed message", async () => {
    // The #688 path: the lobby banner opens the report screen with ?diagnostic=auto.
    routeQuery.diagnostic = "auto";
    rustResponses.set("run_server_diagnostic", capture);
    const wrapper = mountReports();
    await settle();

    await send(wrapper);
    await settle();

    expect(fakeBackend.reports).toHaveLength(1);
    const report = fakeBackend.reports[0];
    // The scan itself, compact, after the player's pre-filled message - not lost in the logs.
    expect(report.message).toBe(
      fr.diagnostic.prefill + DIAGNOSTIC_HEADER + JSON.stringify(capture),
    );
    // The rest of the payload still flows as before.
    expect(report.logs).toBe("log line 1\nlog line 2");
    expect(report.device).toBe("=> System: test rig");
  });

  it("attaches a manually run capture too", async () => {
    rustResponses.set("run_server_diagnostic", capture);
    const wrapper = mountReports();
    await button(wrapper, fr.diagnostic.capture.inGame).trigger("click");
    await settle();
    await wrapper
      .find(".text-area-wrapper textarea")
      .setValue("the crew never lands together");

    await send(wrapper);
    await settle();

    expect(fakeBackend.reports).toHaveLength(1);
    expect(fakeBackend.reports[0].message).toBe(
      "the crew never lands together" +
        DIAGNOSTIC_HEADER +
        JSON.stringify(capture),
    );
  });

  it("waits for a capture that is still running instead of racing it", async () => {
    // The guided capture sniffs for ~20s and the player can reach Send well inside that window.
    let finishCapture!: (value: unknown) => void;
    rustResponses.set(
      "run_server_diagnostic",
      new Promise((resolve) => (finishCapture = resolve)),
    );
    routeQuery.diagnostic = "auto";
    const wrapper = mountReports();
    await settle();

    await send(wrapper);
    await settle();
    expect(fakeBackend.reports).toHaveLength(0); // the send is waiting, not given up

    finishCapture(capture);
    await settle();
    expect(fakeBackend.reports).toHaveLength(1);
    expect(fakeBackend.reports[0].message).toContain(JSON.stringify(capture));
  });

  it("reports the failure line when the capture could not run", async () => {
    const failure = Promise.reject(new Error("SoT is not running"));
    failure.catch(() => {}); // the component's await is the real handler; this quiets the runner
    rustResponses.set("run_server_diagnostic", failure);
    routeQuery.diagnostic = "auto";
    const wrapper = mountReports();
    await settle();

    await send(wrapper);
    await settle();

    expect(fakeBackend.reports).toHaveLength(1);
    expect(fakeBackend.reports[0].message).toContain(
      "auto-diagnostic capture failed: Error: SoT is not running",
    );
  });

  it("sends the message untouched when no capture was run", async () => {
    const wrapper = mountReports();
    await wrapper
      .find(".text-area-wrapper textarea")
      .setValue("plain bug, no diagnostic");

    await send(wrapper);
    await settle();

    expect(fakeBackend.reports).toHaveLength(1);
    expect(fakeBackend.reports[0].message).toBe("plain bug, no diagnostic");
  });

  it("cuts an oversized capture at the cap instead of dropping it", async () => {
    const huge = { ...capture, flows: Array(200).fill(flow) };
    expect(JSON.stringify(huge).length).toBeGreaterThan(MESSAGE_MAX_LENGTH);
    rustResponses.set("run_server_diagnostic", huge);
    routeQuery.diagnostic = "auto";
    const wrapper = mountReports();
    await settle();

    await send(wrapper);
    await settle();

    const message = fakeBackend.reports[0].message;
    expect(message.length).toBe(MESSAGE_MAX_LENGTH);
    expect(message.startsWith(fr.diagnostic.prefill + DIAGNOSTIC_HEADER)).toBe(
      true,
    );
    expect(message.endsWith(DIAGNOSTIC_TRUNCATED)).toBe(true);
  });

  it("still refuses an empty message", async () => {
    const wrapper = mountReports();

    await send(wrapper);
    await settle();

    expect(fakeBackend.reports).toHaveLength(0);
    expect(sentAlerts.map((a) => a.title)).toContain(
      fr.alert.report.emptyMessage.title,
    );
  });
});

describe("attachDiagnostic", () => {
  it("leaves the message alone when there is no capture", () => {
    expect(attachDiagnostic("just words", "")).toBe("just words");
  });

  it("appends the whole capture when it fits", () => {
    expect(attachDiagnostic("note", '{"a":1}')).toBe(
      "note" + DIAGNOSTIC_HEADER + '{"a":1}',
    );
  });

  it("cuts the capture, never the player's words, exactly at the limit", () => {
    const scan = "0123456789".repeat(10);
    const limit =
      "note".length +
      DIAGNOSTIC_HEADER.length +
      DIAGNOSTIC_TRUNCATED.length +
      40;
    const attached = attachDiagnostic("note", scan, limit);
    expect(attached).toBe(
      "note" + DIAGNOSTIC_HEADER + scan.slice(0, 40) + DIAGNOSTIC_TRUNCATED,
    );
    expect(attached.length).toBe(limit);
  });

  it("keeps the message intact when the cap leaves no room at all", () => {
    const message = "x".repeat(50);
    expect(attachDiagnostic(message, "0123456789", 50)).toBe(message);
  });
});

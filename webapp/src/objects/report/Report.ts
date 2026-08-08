import { HTTPAxios } from "@/objects/utils/HTTPAxios.ts";
import { info, warn } from "@tauri-apps/plugin-log";

export interface ReportInterface {
  message: string;
  logs: string;
  device: string;
}

export class BugReport {
  public report: ReportInterface;

  constructor(report: ReportInterface) {
    this.report = report;
  }

  sendReport() {
    info("[Report.ts] Sending a report");
    // Best effort: HTTPAxios rejects on a non-2xx now, so swallow a failed send rather than leaking an
    // unhandled rejection (the report is fire-and-forget, nothing awaits it).
    new HTTPAxios("report/send").post(this.report).catch(() => {
      warn("[Report.ts] Failed to send the report");
    });
  }
}

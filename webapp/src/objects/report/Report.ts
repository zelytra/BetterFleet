import { HTTPAxios } from "@/objects/utils/HTTPAxios.ts";
import { info } from "tauri-plugin-log-api";

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
    new HTTPAxios("report/send").post(this.report);
  }
}

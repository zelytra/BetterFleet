import {HTTPAxios} from "@/objects/utils/HTTPAxios.ts";

export interface ReportInterface {
  message: string
  logs: string
  device: string
}

export class BugReport {

  public report: ReportInterface;

  constructor(report: ReportInterface) {
    this.report = report;
  }

  sendReport() {
    new HTTPAxios("report/send").post(this.report)
  }
}
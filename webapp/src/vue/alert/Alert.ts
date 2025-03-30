import flame from "@/assets/icons/alert-flame.svg";
import { AlertUtils } from "@/vue/alert/AlertUtils.ts";

export class AlertType {
  static readonly VALID = new AlertType("VALID", flame);
  static readonly ERROR = new AlertType("ERROR", flame);
  static readonly WARNING = new AlertType("WARNING", flame);

  // private to disallow creating other instances of this type
  private constructor(
    public readonly key: string,
    public readonly value: any,
  ) {}

  toString() {
    return this.value;
  }
}

export interface Alert {
  type: AlertType;
  title: string;
  content: string;
  id?: number;
}

export class AlertProvider {
  private alerts: Alert[] = [];

  constructor() {}

  public get getAlerts() {
    return this.alerts;
  }

  public sendAlert(alert: Alert) {
    alert.id = Math.floor(Math.random() * 1000);
    this.alerts.push(alert);

    setTimeout(() => {
      const index = this.alerts.indexOf(alert, 0);
      if (index > -1) {
        this.alerts.splice(index, 1);
      }
    }, 5000);
  }

  public handleError(status: number) {
    switch (status) {
      case 403: {
        this.sendAlert(AlertUtils.getForbiddenAccessAlert());
        break;
      }
      case 500: {
        this.sendAlert(AlertUtils.getErrorAlert());
        break;
      }
      case 400: {
        this.sendAlert(AlertUtils.getBadRequest());
        break;
      }
      case 415: {
        this.sendAlert(AlertUtils.getUnsupportedMediaType());
        break;
      }
    }
  }
}

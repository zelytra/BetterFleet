import { Alert, AlertType } from "@/vue/alert/Alert.ts";

export class AlertUtils {
  public static getErrorAlert(): Alert {
    return {
      type: AlertType.ERROR,
      title: "Erreur",
      content: "Une erreur est survenue en tentant de contacté le serveur.",
    };
  }

  public static getForbiddenAccessAlert(): Alert {
    return {
      type: AlertType.ERROR,
      title: "Accès refusé",
      content:
        "Vous ne disposez pas des autorisations nécessaire pour acceder a cette page.",
    };
  }

  public static getBadRequest(): Alert {
    return {
      type: AlertType.ERROR,
      title: "Mauvaise requête",
      content: "La requête est corrompue ou incorrect.",
    };
  }

  public static getUnsupportedMediaType(): Alert {
    return {
      type: AlertType.ERROR,
      title: "Media non supporté",
      content:
        "Le media que vous tenté d'envoyer n'est pas supporter par l'application.",
    };
  }
}

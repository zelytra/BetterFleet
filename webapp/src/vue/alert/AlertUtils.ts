import {Alert, AlertType} from "@/vue/alert/Alert.ts";
import i18n from "@/objects/i18n";

const {t} = i18n.global;

export class AlertUtils {
    public static getErrorAlert(): Alert {
        return {
            type: AlertType.ERROR,
            title: t('alert.error.title'),
            content: t('alert.error.content'),
        };
    }

    public static getForbiddenAccessAlert(): Alert {
        return {
            type: AlertType.ERROR,
            title: t('alert.forbidden.title'),
            content: t('alert.forbidden.content'),
        };
    }

    public static getBadRequest(): Alert {
        return {
            type: AlertType.ERROR,
            title: t('alert.badRequest.title'),
            content: t('alert.badRequest.content'),
        };
    }

    public static getUnsupportedMediaType(): Alert {
        return {
            type: AlertType.ERROR,
            title: t('alert.unsupportedMedia.title'),
            content: t('alert.unsupportedMedia.content'),
        };
    }
}

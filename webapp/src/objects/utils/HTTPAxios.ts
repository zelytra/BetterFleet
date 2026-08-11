import { keycloakStore } from "@/objects/stores/LoginStates.ts";
import { fetch } from "@tauri-apps/plugin-http";
import { info, warn } from "@tauri-apps/plugin-log";
import { alertProvider } from "@/main.ts";
import { AlertType } from "@/vue/alert/Alert.ts";
import { tsi18n } from "@/objects/i18n";

export class HTTPAxios {
  private readonly path: string;
  // Authorization is set when a token is minted and DELETED when a refresh fails: the backend
  // verifies any bearer it is handed (proactive auth), so a stale token 401s even endpoints that
  // need no auth at all - the session browser froze on exactly that (#803). No header beats a dead
  // header.
  private static readonly header: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE",
  };
  // One alert per expiry, not one per second: the 1s refresh loop keeps calling updateToken after
  // the session died, and the player needs telling once, not sixty times a minute.
  private static sessionExpiredNotified = false;
  private readonly url = import.meta.env.VITE_BACKEND_HOST + "/";

  constructor(path: string) {
    this.path = path;
  }

  async get() {
    const urlPath = this.url + this.path;
    info("[HTTPAxios.ts][GET] " + urlPath);
    // v2 plugin-http is WHATWG-fetch-shaped: it returns a standard Response, so callers read the
    // body with `await res.json()` / `await res.text()` (there is no v1 `responseType`/`.data`).
    const response = await fetch(urlPath, {
      method: "GET",
      headers: HTTPAxios.header,
    });
    // WHATWG fetch resolves on 4xx/5xx, so guard here: otherwise a non-2xx socket/register would
    // hand its error body back as the token and get spliced straight into a WebSocket URL.
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response;
  }

  async post(body: any) {
    const urlPath = this.url + this.path;
    info("[HTTPAxios.ts][POST] " + urlPath);
    // v2 fetch takes a WHATWG BodyInit: send a JSON string and declare the content type (v1's
    // `Body.json()` helper is gone).
    const response = await fetch(urlPath, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { ...HTTPAxios.header, "Content-Type": "application/json" },
    });
    // fetch resolves on 4xx/5xx too; surface those as errors so a caller's .catch fires instead of
    // the failed request passing for a success.
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response;
  }

  /*
      async delete() {
        const urlPath = this.url + this.path;
        return await this.axios.delete(urlPath);
      }

      async patch() {
        const urlPath = this.url + this.path;
        return await this.axios.patch(urlPath, this.json);
      }*/

  /**
   * Refreshes the access token and (re)arms the shared Authorization header. Never rejects: a
   * failed refresh (expired Keycloak session, the Linux `ensureFreshLinux` throw) clears the
   * header instead of leaving a dead bearer replayed forever (#803: the session browser 401'd
   * every 5s for hours on a token six hours past its exp), and tells the player once that the
   * session expired. The next successful refresh re-arms the header and re-enables the alert.
   */
  public static async updateToken() {
    try {
      const refreshed = await keycloakStore.keycloak.updateToken(60);
      if (refreshed) console.debug("Token was successfully refreshed");
      HTTPAxios.header.Authorization = "Bearer " + keycloakStore.keycloak.token;
      HTTPAxios.sessionExpiredNotified = false;
    } catch (e) {
      if ("Authorization" in HTTPAxios.header) {
        delete HTTPAxios.header.Authorization;
        warn(
          "[HTTPAxios] token refresh failed, cleared the stale bearer: " + e,
        );
      }
      if (!HTTPAxios.sessionExpiredNotified) {
        HTTPAxios.sessionExpiredNotified = true;
        alertProvider.sendAlert({
          title: tsi18n.global.t("alert.auth.expired.title"),
          content: tsi18n.global.t("alert.auth.expired.content"),
          type: AlertType.WARNING,
        });
      }
    }
  }
}

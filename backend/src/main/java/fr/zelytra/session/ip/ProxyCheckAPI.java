package fr.zelytra.session.ip;

import fr.zelytra.session.SessionSocket;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Class retrieving data from ProxyChecker api
 * <a href="https://proxycheck.io/">web site</a>
 * <p>
 * The api have a limitation of 100 request per day without token. Increased to 1000 with a token.
 */
@ApplicationScoped
public class ProxyCheckAPI {

    private static final String apiURL = "https://proxycheck.io/v2/";
    private static final String requestPathParam = "asn=1";
    private static final String tokenParam = "key=";

    private final StringBuilder finalUrl = new StringBuilder();
    private String ip;

    public ProxyCheckAPI() {
    }

    public ProxyCheckAPI(String ip) {
        this.ip = ip;
        finalUrl.append(apiURL)
                .append(this.getIp())
                .append("?")
                .append(requestPathParam);

        if (!SessionSocket.PROXY_API_KEY.isEmpty()) {
            finalUrl.append("&")
                    .append(tokenParam)
                    .append(SessionSocket.PROXY_API_KEY);
        }
    }

    public String retrieveCountry() {
        try {
            URL url = new URL(finalUrl.toString());

            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");

            int responseCode = connection.getResponseCode();
            if (responseCode == HttpURLConnection.HTTP_OK) {

                // proxycheck.io responds in UTF-8. Decode explicitly instead of relying on
                // the JVM default charset (often not UTF-8 in a Docker/Linux container), which
                // mangled accented locations such as "Île-de-France".
                BufferedReader in = new BufferedReader(
                        new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
                String inputLine;
                StringBuilder response = new StringBuilder();

                while ((inputLine = in.readLine()) != null) {
                    response.append(inputLine);
                }
                in.close();

                return parseLocation(response.toString(), this.getIp());
            } else {
                Log.error("GET request not worked, Response Code: " + responseCode);
            }
        } catch (Exception e) {
            Log.error("Failed to retrieve information via ProxyChecker of ip " + this.getIp());
            e.printStackTrace();
        }
        return "";
    }

    /**
     * Builds the "continent - country - region - city" location string from a raw proxycheck.io
     * JSON response. Extracted as a pure, static helper so the parsing can be unit-tested without
     * hitting the network. Returns an empty string when the API reports a non-"ok" status (e.g. the
     * free-tier request limit was reached).
     *
     * @param jsonResponse the raw JSON body returned by proxycheck.io
     * @param ip           the queried IP, which is also the key holding the location object
     * @return the formatted location, or "" when the response status is not "ok"
     */
    static String parseLocation(String jsonResponse, String ip) {
        JSONObject json = new JSONObject(jsonResponse);

        String status = json.optString("status", "");
        if (!Objects.equals(status, "ok")) {
            Log.warn("[PROXY CHECK] proxycheck.io status '" + status + "' for " + ip
                    + " (free-tier limit reached? set a token via PROXY_API_KEY). No location resolved.");
            return "";
        }

        // proxycheck.io only returns the fields it actually has for an IP, and datacenter
        // ranges (Azure/Microsoft SoT servers) often omit some of them. Use optString and
        // keep whatever is present, instead of getString which THROWS on a missing field and
        // used to blank the whole location (the `!= null` guards never fired — getString
        // never returns null).
        JSONObject ipJsonObject = json.optJSONObject(ip);
        if (ipJsonObject == null) {
            Log.warn("[PROXY CHECK] proxycheck.io response had no entry for " + ip);
            return "";
        }

        List<String> parts = new ArrayList<>();
        for (String field : List.of("continent", "country", "region", "city")) {
            String value = ipJsonObject.optString(field, "");
            if (!value.isBlank()) {
                parts.add(value);
            }
        }

        if (parts.isEmpty()) {
            Log.warn("[PROXY CHECK] proxycheck.io returned no geo fields for " + ip);
            return "";
        }

        String location = String.join(" - ", parts);
        Log.info("[PROXY CHECK] Located SoT server " + ip + ": " + location);
        return location;
    }

    public String getIp() {
        return ip;
    }

    public void setIp(String ip) {
        this.ip = ip;
    }
}

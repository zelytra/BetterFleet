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

    /**
     * Geolocation of an IP: the human-readable location string and the ISO 3166-1 alpha-2 country
     * code (lowercase). {@link #EMPTY} is returned when nothing could be resolved.
     */
    public record Geo(String location, String countryCode) {
        public static final Geo EMPTY = new Geo("", "");
    }

    /**
     * Resolves a human-readable "continent - country - region - city" location for an IP via
     * proxycheck.io. Returns "" on any failure (network error, non-"ok" status, no geo fields).
     * Stateless and injectable, so the session flow can mock it out and stay offline in tests.
     */
    public Geo resolveGeo(String ip) {
        try {
            URL url = new URL(buildUrl(ip));

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

                return parseGeo(response.toString(), ip);
            } else {
                Log.error("GET request not worked, Response Code: " + responseCode);
            }
        } catch (Exception e) {
            Log.error("Failed to retrieve information via ProxyChecker of ip " + ip);
            e.printStackTrace();
        }
        return Geo.EMPTY;
    }

    /**
     * Convenience wrapper returning only the human-readable location string, for callers (and
     * tests) that don't need the country code.
     */
    public String resolveLocation(String ip) {
        return resolveGeo(ip).location();
    }

    private static String buildUrl(String ip) {
        StringBuilder finalUrl = new StringBuilder();
        finalUrl.append(apiURL).append(ip).append("?").append(requestPathParam);
        if (!SessionSocket.PROXY_API_KEY.isEmpty()) {
            finalUrl.append("&").append(tokenParam).append(SessionSocket.PROXY_API_KEY);
        }
        return finalUrl.toString();
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
        return parseGeo(jsonResponse, ip).location();
    }

    /**
     * Builds the geolocation (location string + ISO country code) from a raw proxycheck.io JSON
     * response. Pure and static so the parsing can be unit-tested without hitting the network.
     * Returns {@link Geo#EMPTY} when the response status is not "ok" or holds no entry for the IP.
     *
     * @param jsonResponse the raw JSON body returned by proxycheck.io
     * @param ip           the queried IP, which is also the key holding the location object
     * @return the resolved {@link Geo}
     */
    static Geo parseGeo(String jsonResponse, String ip) {
        JSONObject json = new JSONObject(jsonResponse);

        String status = json.optString("status", "");
        if (!Objects.equals(status, "ok")) {
            Log.warn("[PROXY CHECK] proxycheck.io status '" + status + "' for " + ip
                    + " (free-tier limit reached? set a token via PROXY_API_KEY). No location resolved.");
            return Geo.EMPTY;
        }

        // proxycheck.io only returns the fields it actually has for an IP, and datacenter
        // ranges (Azure/Microsoft SoT servers) often omit some of them. Use optString and
        // keep whatever is present, instead of getString which THROWS on a missing field and
        // used to blank the whole location (the `!= null` guards never fired — getString
        // never returns null).
        JSONObject ipJsonObject = json.optJSONObject(ip);
        if (ipJsonObject == null) {
            Log.warn("[PROXY CHECK] proxycheck.io response had no entry for " + ip);
            return Geo.EMPTY;
        }

        List<String> parts = new ArrayList<>();
        for (String field : List.of("continent", "country", "region", "city")) {
            String value = ipJsonObject.optString(field, "");
            if (!value.isBlank()) {
                parts.add(value);
            }
        }
        // ISO 3166-1 alpha-2, lowercased to match the frontend flag map (LangIcons).
        String countryCode = ipJsonObject.optString("isocode", "").toLowerCase();

        if (parts.isEmpty()) {
            Log.warn("[PROXY CHECK] proxycheck.io returned no geo fields for " + ip);
            return new Geo("", countryCode);
        }

        String location = String.join(" - ", parts);
        Log.info("[PROXY CHECK] Located SoT server " + ip + ": " + location + " [" + countryCode + "]");
        return new Geo(location, countryCode);
    }
}

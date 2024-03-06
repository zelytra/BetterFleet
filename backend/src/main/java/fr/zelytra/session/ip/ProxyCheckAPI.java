package fr.zelytra.session.ip;

import io.quarkus.logging.Log;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Class retrieving data from ProxyChecker api
 * <a href="https://proxycheck.io/">web site</a>
 * <p>
 * The api have a limitation of 100 request per day without token. Increased to 1000 with a token.
 */
public class ProxyCheckAPI {

    private static final String apiURL = "https://proxycheck.io/v2/";
    private static final String requestPathParam = "asn=1";
    private static final String tokenParam = "key=";

    private final StringBuilder finalUrl = new StringBuilder();
    private final String ip;

    public ProxyCheckAPI(String ip) {
        this.ip = ip;
        finalUrl.append(apiURL).append(ip).append("?").append(requestPathParam);
    }

    public ProxyCheckAPI(String ip, String apiKey) {
        this.ip = ip;
        finalUrl.append(apiURL)
                .append(ip)
                .append("?")
                .append(requestPathParam)
                .append("&")
                .append(tokenParam)
                .append(apiKey);
    }

    public String retrieveCountry() {
        try {
            URL url = new URL(finalUrl.toString());

            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");

            int responseCode = connection.getResponseCode();
            if (responseCode == HttpURLConnection.HTTP_OK) {

                BufferedReader in = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                String inputLine;
                StringBuilder response = new StringBuilder();

                while ((inputLine = in.readLine()) != null) {
                    response.append(inputLine);
                }
                in.close();

                StringBuilder location = new StringBuilder();
                JSONObject jsonResponse = new JSONObject(response.toString());
                JSONObject ipJsonObject = jsonResponse.getJSONObject(ip); // Assuming the value is a String

                location.append(ipJsonObject.getString("continent")).append(" - ");
                location.append(ipJsonObject.getString("country")).append(" - ");
                location.append(ipJsonObject.getString("region")).append(" - ");
                location.append(ipJsonObject.getString("city"));

                Log.info("[PROXY CHECK] New SOT server detected !");

                return location.toString();

            } else {
                Log.error("GET request not worked, Response Code: " + responseCode);
            }
        } catch (Exception e) {
            Log.error("Failed to retrieve information via ProxyChecker of ip " + this.ip);
            e.printStackTrace();
        }
        return "";
    }

}

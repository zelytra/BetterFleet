package fr.zelytra.session.ip;

import fr.zelytra.session.SessionSocket;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
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

                BufferedReader in = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                String inputLine;
                StringBuilder response = new StringBuilder();

                while ((inputLine = in.readLine()) != null) {
                    response.append(inputLine);
                }
                in.close();

                StringBuilder location = new StringBuilder();
                JSONObject jsonResponse = new JSONObject(response.toString());

                if(!Objects.equals(jsonResponse.getString("status"), "ok")){
                    Log.warn("The proxy checker has reach is free limit, please provide a token or change the bill plan of your token api");
                    return "";
                }

                JSONObject ipJsonObject = jsonResponse.getJSONObject(this.getIp());

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
            Log.error("Failed to retrieve information via ProxyChecker of ip " + this.getIp());
            e.printStackTrace();
        }
        return "";
    }

    public String getIp() {
        return ip;
    }

    public void setIp(String ip) {
        this.ip = ip;
    }
}

package fr.zelytra.github;

import com.google.gson.Gson;
import jakarta.enterprise.context.ApplicationScoped;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

@ApplicationScoped
public class GithubApi {

    public static final String RELEASE_URL = "https://github.com/zelytra/BetterFleet/releases/latest/download/latest.json";
    private final GithubRelease githubRelease;

    public GithubApi() throws IOException {
        this.githubRelease = parseGithubRelease(getJsonString(new URL(RELEASE_URL)));
    }

    public GithubRelease parseGithubRelease(String jsonString) {
        // Parse JSON response
        Gson gson = new Gson();
        TauriRelease tauriRelease = gson.fromJson(jsonString, TauriRelease.class);

        GithubRelease githubRelease = new GithubRelease();
        githubRelease.setVersion(tauriRelease.version());
        githubRelease.setUrl(tauriRelease.platforms().get("windows-x86_64").url().replace("nsis.zip", "exe"));

        return githubRelease;
    }

    private static String getJsonString(URL url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();

        // Now it's "open", we can set the request method, headers etc.
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestMethod("GET");

        // This line makes the request
        BufferedReader in = new BufferedReader(new InputStreamReader(connection.getInputStream()));
        String inputLine;
        StringBuilder content = new StringBuilder();
        while ((inputLine = in.readLine()) != null) {
            content.append(inputLine);
        }

        // Close the connections
        in.close();
        connection.disconnect();

        // Convert the StringBuffer to a string
        return content.toString();
    }

    public GithubRelease getGithubRelease() {
        return githubRelease;
    }
}

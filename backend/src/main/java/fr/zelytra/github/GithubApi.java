package fr.zelytra.github;

import com.google.gson.Gson;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class GithubApi {

    private static final String releaseUrl = "https://github.com/zelytra/BetterFleet/releases/latest/download/latest.json";

    private final GithubRelease githubRelease;

    public GithubApi() throws IOException {
        // Create a neat value object to hold the URL
        URL url = new URL("https://github.com/zelytra/BetterFleet/releases/latest/download/latest.json");

        // Open a connection(?) on the URL(??) and cast the response(???)
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();

        // Now it's "open", we can set the request method, headers etc.
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestMethod("GET");

        // This line makes the request
        BufferedReader in = new BufferedReader(new InputStreamReader(connection.getInputStream()));
        String inputLine;
        StringBuffer content = new StringBuffer();
        while ((inputLine = in.readLine()) != null) {
            content.append(inputLine);
        }

        // Close the connections
        in.close();
        connection.disconnect();

        // Convert the StringBuffer to a string
        String jsonString = content.toString();

        // Parse JSON response
        Gson gson = new Gson();
        TauriRelease tauriRelease = gson.fromJson(jsonString, TauriRelease.class);

        // Process the data as needed
        this.githubRelease = new GithubRelease();
        githubRelease.version = tauriRelease.version;
        //githubRelease.publicationDate = new Date(tauriRelease.pub_date);
        githubRelease.url = tauriRelease.platforms.get("windows-x86_64").url.replace("nsis.zip", "exe");

    }

    public GithubRelease getGithubRelease() {
        return githubRelease;
    }
}

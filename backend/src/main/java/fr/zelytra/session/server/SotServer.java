package fr.zelytra.session.server;

import fr.zelytra.session.ip.ProxyCheckAPI;
import fr.zelytra.session.player.Player;
import io.quarkus.logging.Log;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;

public class SotServer {

    private String ip;
    private int port;
    private String location;
    private String hash;
    private List<Player> connectedPlayers;

    @ConfigProperty(name = "proxy.check.api.key")
    String proxyApiKey;

    public SotServer() {
    }

    // Constructor
    public SotServer(String ip, int port) {
        this.ip = ip;
        this.port = port;

        ProxyCheckAPI proxyCheckAPI = new ProxyCheckAPI(ip);
        this.location = proxyCheckAPI.retrieveCountry();
        this.hash = generateHash();
        this.connectedPlayers = new ArrayList<>();
    }

    public String generateHash() {
        // Combine IP and port into a single string
        String input = this.ip + ":" + this.port;

        // Use SHA-256 hash function
        MessageDigest digest = null;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
        byte[] hashBytes = digest.digest(input.getBytes(StandardCharsets.UTF_8));

        // Convert the hash bytes to hexadecimal format
        StringBuilder hexString = new StringBuilder();
        for (int i = 0; i < hashBytes.length && hexString.length() < 6; i++) {
            String hex = Integer.toHexString(0xff & hashBytes[i]);
            if (hex.length() == 1) hexString.append('0');
            hexString.append(hex);
        }

        // Return the first 6 characters of the hex string
        return hexString.substring(0, 6);
    }

    // Getters and Setters
    public String getIp() {
        return ip;
    }

    public int getPort() {
        return port;
    }

    public String getLocation() {
        return location;
    }

    public List<Player> getConnectedPlayers() {
        return connectedPlayers;
    }

    public String getHash() {
        return hash;
    }

    @Override
    public String toString() {
        return ip + ":" + port + " | " + hash + " | " + location;
    }
}


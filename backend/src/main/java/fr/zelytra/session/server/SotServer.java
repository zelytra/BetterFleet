package fr.zelytra.session.server;

import fr.zelytra.session.ip.ProxyCheckAPI;
import fr.zelytra.session.player.Player;
import jakarta.enterprise.context.ApplicationScoped;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

@ApplicationScoped
public class SotServer {

    private String ip;
    private int port;
    private String location;
    private String hash;
    private String color;
    private List<Player> connectedPlayers;

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
        this.color = getRandomColor();
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

    public String getColor() {
        return color;
    }

    private String getRandomColor() {
        List<String> colors = List.of(
                "#32D499",
                "#32CAD4",
                "#327DD4",
                "#9632D4",
                "#D132D4",
                "#D43289",
                "#D4324F",
                "#D43232",
                "#32D45F",
                "#32D438",
                "#83D432",
                "#BDD432",
                "#D49332",
                "#D47632",
                "#D45932",
                "#D44F32",
                "#D37070",
                "#D3A070",
                "#ADD370",
                "#70D37A",
                "#7092D3",
                "#9C70D3",
                "#D370C9",
                "#D37082",
                "#D37070");
        Random random = new Random();
        return colors.get(random.nextInt(colors.size()));
    }

    @Override
    public String toString() {
        return ip + ":" + port + " | " + hash + " | " + location;
    }
}


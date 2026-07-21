package fr.zelytra.session.server;

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
    private String countryCode;
    private String hash;
    private String color;
    private List<Player> connectedPlayers;

    public SotServer() {
    }

    // Convenience constructor for a server whose location isn't resolved yet (e.g. the raw
    // server a client reports). Performs no network call.
    public SotServer(String ip, int port) {
        this(ip, port, "", "");
    }

    public SotServer(String ip, int port, String location) {
        this(ip, port, location, "");
    }

    // Authoritative constructor: the location + country code are resolved by the caller
    // (SessionManager via the injectable ProxyCheckAPI) and passed in, keeping network I/O out of
    // the constructor.
    public SotServer(String ip, int port, String location, String countryCode) {
        this.ip = ip;
        this.port = port;
        this.location = location;
        this.countryCode = countryCode;
        this.hash = generateHash();
        this.connectedPlayers = new ArrayList<>();
        this.color = getRandomColor();
    }

    public String generateHash() {
        // A server is identified by its IP alone, not ip:port.
        //
        // Sea of Thieves hands each client on a server its own UDP port on the same host, so ip:port
        // made every crewmate on one server look like a separate server: issue #364 captured four
        // players demonstrably sailing together on 51.103.45.67, on ports 30970 / 31106 / 31242 /
        // 31310, split into four cards. The port is per-connection noise; the host is the server.
        //
        // This is also what the client has always assumed - GameSync.ts decides "did I change
        // servers?" on `player.server.ip != rustSotServer.ip`, never the port. The backend hash was
        // the one place that disagreed.
        String input = this.ip;

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

    public String getCountryCode() {
        return countryCode;
    }

    /**
     * Set once the geolocation lands, which happens after the server is already visible to the
     * fleet. Not part of {@link #generateHash()} (that is the IP), so filling it in later keeps
     * the server's identity stable.
     */
    public void setLocation(String location) {
        this.location = location;
    }

    /**
     * Set alongside {@link #setLocation}: the country code is what the browser draws a session's
     * region flag from, so a server that never resolved shows no flag at all.
     */
    public void setCountryCode(String countryCode) {
        this.countryCode = countryCode;
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

    public SotServer copy() {
        SotServer clone = new SotServer();
        clone.ip = this.ip;
        clone.port = this.port;
        clone.location = this.location;
        clone.countryCode = this.countryCode;
        clone.hash = this.hash;
        clone.color = this.color;
        clone.connectedPlayers = new ArrayList<>();
        return clone;
    }
}


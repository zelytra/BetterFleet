package fr.zelytra.session.fleet;

import java.util.List;

public class SotServer {

    private String ip;
    private int port;
    private String location;
    private List<Player> connectedPlayers;

    // Constructor
    public SotServer(String ip, int port, String location, List<Player> connectedPlayers) {
        this.ip = ip;
        this.port = port;
        this.location = location;
        this.connectedPlayers = connectedPlayers;
    }

    // Getters and Setters
    public String getIp() {
        return ip;
    }

    public void setIp(String ip) {
        this.ip = ip;
    }

    public int getPort() {
        return port;
    }

    public void setPort(int port) {
        this.port = port;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public List<Player> getConnectedPlayers() {
        return connectedPlayers;
    }

    public void setConnectedPlayers(List<Player> connectedPlayers) {
        this.connectedPlayers = connectedPlayers;
    }
}


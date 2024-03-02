package fr.zelytra.session.fleet;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

public class Fleet {

    private String sessionId;
    private String sessionName;
    private List<Player> players;
    private List<SotServer> servers;
    private SessionStatus status;

    public Fleet(String sessionId) {
        this.sessionId = sessionId;
        this.sessionName = "A session name"; //TODO
        this.players = new ArrayList<>();
        this.servers = new ArrayList<>();
        this.status = SessionStatus.WAITING;
    }

    public List<Player> getReadyPlayers() {
        return this.players.stream().filter(Player::isReady).collect(Collectors.toList());
    }

    public List<Player> getMasters() {
        return this.players.stream().filter(Player::isMaster).collect(Collectors.toList());
    }

    // Getters and Setters
    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getSessionName() {
        return sessionName;
    }

    public void setSessionName(String sessionName) {
        this.sessionName = sessionName;
    }

    public List<Player> getPlayers() {
        return players;
    }

    public void setPlayers(List<Player> players) {
        this.players = players;
    }

    public List<SotServer> getServers() {
        return servers;
    }

    public void setServers(List<SotServer> servers) {
        this.servers = servers;
    }

    public SessionStatus getStatus() {
        return status;
    }

    public void setStatus(SessionStatus status) {
        this.status = status;
    }
}


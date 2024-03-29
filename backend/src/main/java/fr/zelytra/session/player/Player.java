package fr.zelytra.session.player;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.websocket.Session;

public class Player {

    private String username;
    private PlayerStates status;

    @JsonProperty(value="isReady")
    private boolean isReady;

    @JsonProperty(value="isMaster")
    private boolean isMaster;

    private String sessionId; // Not always the same as the fleet

    @JsonIgnore
    private Session socket;

    private String clientVersion;

    private PlayerDevice device;

    // Constructor
    public Player() {
    }

    // Getters and Setters

    public Session getSocket() {
        return socket;
    }

    public void setSocket(Session socket) {
        this.socket = socket;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public PlayerStates getStatus() {
        return status;
    }

    public void setStatus(PlayerStates status) {
        this.status = status;
    }

    public boolean isReady() {
        return isReady;
    }

    public void setReady(boolean ready) {
        isReady = ready;
    }

    public boolean isMaster() {
        return isMaster;
    }

    public void setMaster(boolean master) {
        isMaster = master;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getClientVersion() {
        return clientVersion;
    }

    public void setClientVersion(String clientVersion) {
        this.clientVersion = clientVersion;
    }

    public PlayerDevice getDevice() {
        return device;
    }

    public void setDevice(PlayerDevice device) {
        this.device = device;
    }

    @Override
    public String toString() {
        return this.username;
    }
}


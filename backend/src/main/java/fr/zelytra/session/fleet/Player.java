package fr.zelytra.session.fleet;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.websocket.Session;

public class Player {

    private String username;
    private PlayerStates status;
    private boolean isReady;
    private boolean isMaster;
    @JsonIgnore
    private Session socket;

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

    @Override
    public String toString() {
        return this.username;
    }
}


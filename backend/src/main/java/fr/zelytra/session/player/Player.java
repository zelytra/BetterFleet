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

    private BoatSize boatSize;

    // The host's preferred server banner (app-provided template index). Carried on CONNECT and
    // copied onto the session when they create it. See issue #602 (frontend banner picker).
    private int banner;

    // The player's country as a lowercase ISO 3166-1 alpha-2 code, derived by the client from the
    // browser locale. Drives the session owner's flag in the public browser (issue #672).
    private String country;

    // Whether this player contributes to the anonymous alliance statistics (issue #673). Opt-out:
    // initialized true so a client that never sends the field — every pre-#673 client — keeps
    // participating; Jackson only overwrites fields present in the JSON.
    private boolean shareStats = true;

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

    public BoatSize getBoatSize() {
        return boatSize;
    }

    public void setBoatSize(BoatSize boatSize) {
        this.boatSize = boatSize;
    }

    public int getBanner() {
        return banner;
    }

    public void setBanner(int banner) {
        this.banner = banner;
    }

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
    }

    public boolean isShareStats() {
        return shareStats;
    }

    public void setShareStats(boolean shareStats) {
        this.shareStats = shareStats;
    }

    @Override
    public String toString() {
        return this.username;
    }
}


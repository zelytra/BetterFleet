package fr.zelytra.session.fleet;

import com.fasterxml.jackson.annotation.JsonProperty;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.server.SotServer;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

@ApplicationScoped
public class Fleet {

    private String sessionId;

    // Stable identity for the directory, deliberately unrelated to sessionId: a private session's
    // code is withheld from the browser, but its row still needs something to be keyed and animated
    // by. Unguessable, so publishing it gives away nothing.
    private final String directoryId;

    private int sessionName;

    @JsonProperty(value = "isPrivate")
    private boolean isPrivate;

    private int banner;

    // Optional free-text name set by the master (issue #604); null/blank falls back to the
    // localized pirate name derived from sessionName.
    private String customName;

    // Both collections are read far more often than they are written, and they are touched from
    // several vert.x event-loop threads: SessionManager's @Lock only covers its own method bodies, so
    // a broadcast serializing the fleet, or a lock-free iteration such as CLEAR_STATUS, can run while
    // leaveSession removes a player. A plain ArrayList/HashMap threw ConcurrentModificationException
    // there (issue #705); concurrent collections make those readers race-free.
    private List<Player> players;
    private final Map<String, SotServer> servers;
    private FleetStats stats;

    public Fleet() {
        this.sessionId = UUID.randomUUID().toString().substring(0, 7).toUpperCase();
        this.directoryId = UUID.randomUUID().toString();
        this.sessionName = (int) (Math.random() * 100);
        this.isPrivate = true; // sessions are unlisted by default; the master opts into public
        this.banner = 0;
        this.players = new CopyOnWriteArrayList<>();
        this.servers = new ConcurrentHashMap<>();
        this.stats = new FleetStats(0, 0);
    }

    public List<Player> getReadyPlayers() {
        return this.players.stream().filter(Player::isReady).collect(Collectors.toList());
    }

    public List<Player> getMasters() {
        return this.players.stream().filter(Player::isMaster).collect(Collectors.toList());
    }

    public String getDirectoryId() {
        return directoryId;
    }

    // Getters and Setters
    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public int getSessionName() {
        return sessionName;
    }

    public void setSessionName(int sessionName) {
        this.sessionName = sessionName;
    }

    public boolean isPrivate() {
        return isPrivate;
    }

    public void setPrivate(boolean isPrivate) {
        this.isPrivate = isPrivate;
    }

    public int getBanner() {
        return banner;
    }

    public void setBanner(int banner) {
        this.banner = banner;
    }

    public String getCustomName() {
        return customName;
    }

    public void setCustomName(String customName) {
        this.customName = customName;
    }

    public List<Player> getPlayers() {
        return players;
    }

    public void setPlayers(List<Player> players) {
        // Copy rather than adopt: keeping the concurrent list is what makes the off-lock readers safe,
        // and a caller handing us a plain ArrayList would silently undo that.
        this.players = players == null ? new CopyOnWriteArrayList<>() : new CopyOnWriteArrayList<>(players);
    }

    public Map<String, SotServer> getServers() {
        return servers;
    }

    public FleetStats getStats() {
        return stats;
    }

    public void setStats(FleetStats stats) {
        this.stats = stats;
    }

    /**
     * The fleet member with exactly this username (case-sensitive), or {@code null} when absent.
     */
    public Player getPlayerFromUsername(String username) {
        for (Player player : this.players) {
            if (player.getUsername().equals(username)) return player;
        }
        return null;
    }

}


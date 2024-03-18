package fr.zelytra.session.fleet;

import fr.zelytra.session.player.Player;
import fr.zelytra.session.server.SotServer;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.*;
import java.util.stream.Collectors;

@ApplicationScoped
public class Fleet {

    private String sessionId;
    private String sessionName;
    private List<Player> players;
    private final Map<String, SotServer> servers;
    private FleetStats stats;

    public Fleet() {
        this.sessionId = UUID.randomUUID().toString().substring(0, 7).toUpperCase();
        this.sessionName = "A session name"; //TODO
        this.players = new ArrayList<>();
        this.servers = new HashMap<>();
        this.stats = new FleetStats(0, 0);
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
     * Retrieves a player by their username.
     * <p>
     * This method iterates through the list of players in the current context (presumably a collection
     * of players within a class, such as a game lobby or session) and returns the player whose username
     * matches the provided username. If no player with the specified username is found, the method returns
     * {@code null}.
     *
     * @param username The username of the player to retrieve.
     * @return The {@link Player} object with the matching username, or {@code null} if no matching player is found.
     */
    public Player getPlayerFromUsername(String username) {
        for (Player player : this.players) {
            if (player.getUsername().equals(username)) return player;
        }
        return null;
    }

}


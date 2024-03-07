package fr.zelytra.session.fleet;

import fr.zelytra.session.SessionStatus;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.server.SotServer;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.stream.Collectors;

public class Fleet {

    private String sessionId;
    private String sessionName;
    private List<Player> players;
    private final HashMap<String, SotServer> servers;
    private SessionStatus status;

    public Fleet(String sessionId) {
        this.sessionId = sessionId;
        this.sessionName = "A session name"; //TODO
        this.players = new ArrayList<>();
        this.servers = new HashMap<>();
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

    public HashMap<String, SotServer> getServers() {
        return servers;
    }

    public SessionStatus getStatus() {
        return status;
    }

    public void setStatus(SessionStatus status) {
        this.status = status;
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
    public Player getPlayerFromUsername(String username){
        for (Player player : this.players){
            if (player.getUsername().equals(username)) return player;
        }
        return null;
    }

}


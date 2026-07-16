package fr.zelytra.session.ip;

import fr.zelytra.session.SessionManager;
import fr.zelytra.session.server.SotServer;
import io.quarkus.logging.Log;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Resolves a server's geolocation away from the thread that reported it.
 * <p>
 * JOIN_SERVER arrives on a vert.x event-loop thread, and the proxycheck.io call regularly takes
 * seconds or times out; running it inline stalls every other socket that event loop carries. So the
 * join completes on the cached (possibly location-less) server, this resolver chases the location on
 * its own pool, and {@link SessionManager#applyServerLocation} broadcasts it once it lands.
 * <p>
 * It owns a small dedicated pool rather than the shared managed executor: geolocation is slow and
 * bursty (a whole crew reports the same server at the end of a countdown) and has no business
 * competing with — or being mistaken for — the stats writes.
 */
@ApplicationScoped
public class GeoLocationResolver {

    private static final int POOL_SIZE = 4;

    @Inject
    SessionManager sessionManager;

    private final ExecutorService geoExecutor = Executors.newFixedThreadPool(POOL_SIZE, runnable -> {
        Thread thread = new Thread(runnable, "geo-lookup");
        thread.setDaemon(true);
        return thread;
    });

    /**
     * Looks the server's geolocation up and broadcasts it to every fleet showing that server, and
     * to the sessions directory — the country code is what the browser draws a region flag from.
     * Returns immediately; does nothing if it is already known or another lookup is in flight.
     * <p>
     * Both calls go through the {@link SessionManager} bean rather than being inlined here: that is
     * what makes the {@code @Lock} interceptor apply to {@code applyServerGeo}.
     */
    public void resolveAndBroadcast(SotServer server) {
        geoExecutor.submit(() -> {
            try {
                ProxyCheckAPI.Geo geo = sessionManager.lookupGeo(server);
                if (!geo.location().isEmpty()) {
                    sessionManager.applyServerGeo(server.generateHash(), geo);
                }
            } catch (Exception e) {
                // submit() would swallow this into a Future nobody reads.
                Log.error("Geolocation of " + server.getIp() + " failed unexpectedly", e);
            }
        });
    }

    @PreDestroy
    void shutdown() {
        geoExecutor.shutdownNow();
    }
}

package fr.zelytra.session;

import fr.zelytra.session.fleet.PublicSessionsSnapshot;
import io.smallrye.mutiny.Multi;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jboss.resteasy.reactive.RestStreamElementType;

/**
 * Public sessions directory (issue #599): a REST snapshot of every public session plus the global
 * connected-player count, and an SSE stream pushing a fresh snapshot whenever either can have
 * changed — so both the list and the counter stay live without hard polling. Uses a base path
 * outside the WebSocket namespace (/sessions/*).
 */
@Path("/public-sessions")
public class SessionDirectoryEndpoints {

    @Inject
    SessionManager sessionManager;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public PublicSessionsSnapshot list() {
        return sessionManager.getPublicSessionsSnapshot();
    }

    @GET
    @Path("/stream")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    public Multi<PublicSessionsSnapshot> stream() {
        return sessionManager.streamPublicSessions();
    }
}

package fr.zelytra.session;

import fr.zelytra.session.fleet.PublicSession;
import io.smallrye.mutiny.Multi;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jboss.resteasy.reactive.RestStreamElementType;

import java.util.List;

/**
 * Public sessions directory (issue #599): a REST snapshot of every public session, plus an SSE
 * stream that pushes a fresh snapshot whenever the public set changes so the browser refreshes
 * live without hard polling. Uses a base path outside the WebSocket namespace (/sessions/*).
 */
@Path("/public-sessions")
public class SessionDirectoryEndpoints {

    @Inject
    SessionManager sessionManager;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public List<PublicSession> list() {
        return sessionManager.getPublicSessions();
    }

    @GET
    @Path("/stream")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    public Multi<List<PublicSession>> stream() {
        return sessionManager.streamPublicSessions();
    }
}

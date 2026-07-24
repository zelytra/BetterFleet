package fr.zelytra.session.socket.security;

import fr.zelytra.session.SessionManager;
import io.quarkus.logging.Log;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/**
 * Unauthenticated socket registration for console players joining a session from the web (issue
 * #682). Kept OUT of {@link SocketSecurityEndpoints} on purpose: its class-level {@code @Authenticated}
 * would force a Keycloak login the console player does not have. Here the session code IS the
 * credential — a token is only issued for a session that already exists, and it is bound to that code
 * (see {@link SocketSecurityEntity} and the guest branch of the CONNECT handler in SessionSocket), so
 * a guest can neither create a session nor hop to another.
 *
 * <p>Kept off the {@code /socket/register} path on purpose: a second JAX-RS class rooted there would
 * collide with the authenticated {@code GET /socket/register} and let its 401 slip.
 */
@Path("/guest")
public class GuestSocketEndpoints {

    @Inject
    SessionManager sessionManager;

    @GET
    @Path("/register")
    @Produces(MediaType.TEXT_PLAIN)
    public Response registerGuest(@QueryParam("sessionId") String sessionId) {
        String code = sessionId == null ? "" : sessionId.trim().toUpperCase();
        if (code.isEmpty() || !sessionManager.isSessionExist(code)) {
            Log.info("[GET] /guest/register refused for unknown session '" + code + "'");
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        SocketSecurityEntity token = new SocketSecurityEntity(code);
        Log.info("[GET] /guest/register for " + code);
        return Response.ok(token.getKey()).build();
    }
}

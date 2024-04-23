package fr.zelytra.session.socket.security;

import io.quarkus.logging.Log;
import io.quarkus.security.Authenticated;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

@Authenticated
@Path("/socket")
public class SocketSecurityEndpoints {

    @GET
    @Path("/register")
    @Produces(MediaType.TEXT_PLAIN)
    public Response registerClient() {
        Log.info("[GET] /socket/register");
        SocketSecurityEntity socketSecurity = new SocketSecurityEntity();
        return Response.ok(socketSecurity.getKey()).build();
    }
}

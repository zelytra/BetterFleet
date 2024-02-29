package fr.zelytra;

import io.quarkus.logging.Log;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

@Path("/")
public class PublicEndpoints {

    @GET
    public Response ping() {
        return Response.ok("Pong!").build();
    }
}

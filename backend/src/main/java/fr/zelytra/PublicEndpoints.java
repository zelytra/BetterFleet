package fr.zelytra;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

@Path("/")
public class PublicEndpoints {

    @GET
    public Response ping() {
        return Response.ok("Pong!").build();
    }
}

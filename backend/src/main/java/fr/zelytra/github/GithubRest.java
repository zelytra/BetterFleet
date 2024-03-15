package fr.zelytra.github;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.io.IOException;

@Path("/github")
public class GithubRest {

    @GET
    @Path("/release/download")
    @Produces(MediaType.APPLICATION_JSON)
    public Response getDownloadLink() throws IOException {
        GithubApi githubApi = new GithubApi();
        return Response.ok(githubApi.getGithubRelease()).build();
    }
}

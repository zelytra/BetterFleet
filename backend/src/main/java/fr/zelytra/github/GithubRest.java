package fr.zelytra.github;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

@Path("/github")
public class GithubRest {

    @Inject
    GithubApi githubApi;

    @GET
    @Path("/release/download")
    @Produces(MediaType.APPLICATION_JSON)
    public Response getDownloadLink() {
        return Response.ok(githubApi.getGithubRelease()).build();
    }
}

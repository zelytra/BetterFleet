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

    @Inject
    GithubLatestReleaseApi githubLatestReleaseApi;

    @GET
    @Path("/release/download")
    @Produces(MediaType.APPLICATION_JSON)
    public Response getDownloadLink() {
        return Response.ok(githubApi.getGithubRelease()).build();
    }

    /**
     * The latest release with every attached asset (name, size, direct download URL), fetched
     * server-side and cached — see {@link GithubLatestReleaseApi}. Feeds the website download page
     * so it no longer hits {@code api.github.com} per visitor.
     */
    @GET
    @Path("/release/latest")
    @Produces(MediaType.APPLICATION_JSON)
    public Response getLatestRelease() {
        return Response.ok(githubLatestReleaseApi.getLatestRelease()).build();
    }
}

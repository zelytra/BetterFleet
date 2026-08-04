package fr.zelytra.github;

import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@QuarkusTest
public class GithubRestTest {

    @InjectMock
    GithubApi githubApi;

    @InjectMock
    GithubLatestReleaseApi githubLatestReleaseApi;

    @BeforeEach
    public void setup(){
        GithubRelease fakeRelease = new GithubRelease();
        fakeRelease.setVersion("1.0.0");
        fakeRelease.setUrl("https://example.com/download.exe");
        Mockito.when(githubApi.getGithubRelease()).thenReturn(fakeRelease);

        LatestRelease fakeLatest = new LatestRelease("2.4.1", List.of(
                new ReleaseAsset("BetterFleet_2.4.1_x64-setup.exe", 8388608L, "https://example.com/setup.exe")));
        Mockito.when(githubLatestReleaseApi.getLatestRelease()).thenReturn(fakeLatest);
    }

    @Test
    public void testGetDownloadLink() {

        given()
                .when().get("/github/release/download")
                .then()
                .statusCode(Response.Status.OK.getStatusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .body("version", equalTo("1.0.0"),
                        "url", equalTo("https://example.com/download.exe"));

        // Verify your mock interactions
        verify(githubApi, times(1)).getGithubRelease();
    }

    @Test
    public void testGetLatestRelease() {

        given()
                .when().get("/github/release/latest")
                .then()
                .statusCode(Response.Status.OK.getStatusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .body("version", equalTo("2.4.1"),
                        "assets[0].name", equalTo("BetterFleet_2.4.1_x64-setup.exe"),
                        "assets[0].size", equalTo(8388608),
                        "assets[0].url", equalTo("https://example.com/setup.exe"));

        verify(githubLatestReleaseApi, times(1)).getLatestRelease();
    }

}

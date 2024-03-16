package fr.zelytra.github;

import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@QuarkusTest
public class GithubRestTest {

    @InjectMock
    GithubApi githubApi;

    @BeforeEach
    public void setup(){
        GithubRelease fakeRelease = new GithubRelease();
        fakeRelease.setVersion("1.0.0");
        fakeRelease.setUrl("https://example.com/download.exe");
        Mockito.when(githubApi.getGithubRelease()).thenReturn(fakeRelease);
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

}

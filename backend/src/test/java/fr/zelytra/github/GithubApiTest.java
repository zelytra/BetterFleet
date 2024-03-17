package fr.zelytra.github;

import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.io.IOException;

@QuarkusTest
public class GithubApiTest {

    @InjectMock
    GithubApi githubApi;

    @BeforeEach
    public void setUp() {
        GithubRelease testRelease = new GithubRelease();
        testRelease.setVersion("1.0.0");
        testRelease.setUrl("https://example.com/download.exe");
        Mockito.when(githubApi.getGithubRelease()).thenReturn(testRelease);
    }

    @Test
    public void testGetGithubRelease() {
        GithubRelease githubRelease = githubApi.getGithubRelease();

        // Verify the release information
        assert "1.0.0".equals(githubRelease.getVersion());
        assert "https://example.com/download.exe".equals(githubRelease.getUrl());
    }

    @Test
    public void testGetGithubReleaseNotNull() throws IOException {
        GithubApi githubApi1 = new GithubApi();

        // Verify the release information
        assert githubApi1.getGithubRelease() != null;
    }

}

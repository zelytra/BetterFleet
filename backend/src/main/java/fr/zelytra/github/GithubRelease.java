package fr.zelytra.github;

public class GithubRelease {

    private String version;
    private String url;

    public GithubRelease(){
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }
}

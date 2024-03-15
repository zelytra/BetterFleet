package fr.zelytra.github;

import java.util.Map;

public class TauriRelease {
    public String version;
    public String notes;
    public String pub_date;
    public Map<String, Platform> platforms;
}

class Platform {
    public String signature;
    public String url;
}
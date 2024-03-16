package fr.zelytra.github;

import java.util.Map;

public record TauriRelease(String version, Map<String, Platform> platforms) {
}


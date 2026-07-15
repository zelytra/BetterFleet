package fr.zelytra.session.fleet;

import java.util.Set;

/**
 * Minimal server-side content guard for user-set session names (issue #604). Session names are
 * public and visible to everyone, so a rename that trips the blocklist is rejected server-side.
 * <p>
 * This is a deliberately small starter list — a production guard should back this with a
 * maintained multilingual dataset (including slurs) or a moderation service rather than a
 * hardcoded set, and use word-boundary matching to avoid false positives (the Scunthorpe problem).
 */
public final class SessionNameFilter {

    public static final int MAX_LENGTH = 40;

    private static final Set<String> BLOCKED = Set.of(
            "fuck", "shit", "bitch", "asshole", "bastard", "dick", "slut", "whore"
    );

    private SessionNameFilter() {
    }

    /**
     * Trims a candidate name and caps it to {@link #MAX_LENGTH} characters. Never returns null.
     */
    public static String clean(String name) {
        if (name == null) {
            return "";
        }
        String trimmed = name.trim();
        return trimmed.length() > MAX_LENGTH ? trimmed.substring(0, MAX_LENGTH) : trimmed;
    }

    /**
     * False when the (already cleaned) name contains a blocked term, matched case-insensitively.
     */
    public static boolean isAllowed(String cleaned) {
        String lower = cleaned.toLowerCase();
        for (String blocked : BLOCKED) {
            if (lower.contains(blocked)) {
                return false;
            }
        }
        return true;
    }
}

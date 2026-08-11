package fr.zelytra.reports;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.quarkus.logging.Log;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Pings a Discord webhook whenever a bug report is submitted, so a new report is seen when it
 * arrives instead of when someone happens to open the reports page.
 * <p>
 * The whole feature is optional and driven by {@code DISCORD_REPORT_WEBHOOK_URL}
 * ({@code discord.report.webhook-url}): unset or blank means silently off, so dev and tests run
 * without any secret (same contract as {@code GITHUB_API_TOKEN}). The URL itself is a credential -
 * anyone holding it can post to the channel - which is why it only ever arrives through the env var
 * and is never logged, not even on failure.
 * <p>
 * {@link #notifyReport(ReportEntity)} must never affect the report path: the embed payload is built
 * inline (pure, microseconds, and any surprise there is caught and only logged) and the one
 * discord.com call runs fire-and-forget on this bean's own single daemon thread with short
 * connect/read timeouts - the same "own pool, never the caller's thread" shape as
 * {@code GeoLocationResolver}. Whatever Discord does (off, slow, down, erroring), the endpoint's
 * response is built identically.
 * <p>
 * The embed carries the report id, submission date, a truncated excerpt of the message (which, now
 * that it embeds the auto-diagnostic capture, can run to many KB), the device summary, and a
 * quick-access link to
 * the website's reports page. User-provided text is fenced into code blocks - that renders the
 * diagnostic capture in monospace (as the reports page does) and neutralises markdown wholesale -
 * and {@code allowed_mentions: {parse: []}} guarantees nothing in it can ping anyone. Payload
 * assembly is the pure, static {@link #buildPayload(ReportEntity, String)}, so the embed shape
 * unit-tests entirely offline.
 */
@ApplicationScoped
public class DiscordReportNotifier {

    // Discord hard-caps an embed description at 4096 chars and a field value at 1024. The raw text
    // is cut to these BEFORE the code fence and mention-neutralising are applied; both grow the text
    // by a bounded handful of chars (see codeBlock/neutralizeMentions), so the caps hold by
    // construction with a wide margin rather than by trusting sanitising not to expand.
    static final int MESSAGE_EXCERPT_MAX_CHARS = 1500;
    static final int DEVICE_MAX_CHARS = 300;

    // Appended to any excerpt that was cut, so the reader knows to open the website for the rest.
    static final String TRUNCATION_MARK = "… [truncated]";

    // The website lists reports at /reports (ReportsComponent.vue); it has no per-report anchor, so
    // the page itself is the most direct link there is.
    static final String REPORTS_PAGE_PATH = "/reports";

    // BetterFleet green (#32d499), the accent colour the website already uses.
    private static final int EMBED_COLOR = 0x32D499;

    // Zero-width space: invisible, but enough to stop "```" closing our fence or "@everyone"
    // reading as a mention.
    private static final String ZWSP = "\u200B";

    // Optional webhook URL (DISCORD_REPORT_WEBHOOK_URL): absent or blank disables the feature.
    @ConfigProperty(name = "discord.report.webhook-url")
    Optional<String> webhookUrl;

    // Public website base (PUBLIC_WEBSITE_URL, defaults to https://betterfleet.fr) for the
    // quick-access link.
    @ConfigProperty(name = "public.website.url", defaultValue = "https://betterfleet.fr")
    String websiteUrl;

    @ConfigProperty(name = "discord.report.connect-timeout-millis", defaultValue = "3000")
    int connectTimeoutMillis;

    @ConfigProperty(name = "discord.report.read-timeout-millis", defaultValue = "3000")
    int readTimeoutMillis;

    // One dedicated daemon thread: report submissions are rare, ordering is nice to have, and the
    // slow network call must never run on (or compete with) a request thread.
    private final ExecutorService webhookExecutor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "discord-report-webhook");
        thread.setDaemon(true);
        return thread;
    });

    /**
     * Queues the Discord notification for a just-persisted report and returns immediately. No-op
     * when the webhook is not configured; any failure, at build or delivery time, is only logged.
     * The caller's response is the same in every case.
     */
    public void notifyReport(ReportEntity report) {
        Optional<String> url = webhookUrl.filter(value -> !value.isBlank());
        if (url.isEmpty()) {
            return;
        }
        try {
            // Built on the caller's thread on purpose: it is pure and instant, and it snapshots the
            // entity's fields into a String so the worker never touches the entity.
            String payload = buildPayload(report, websiteUrl);
            webhookExecutor.submit(() -> postWebhook(url.get(), payload));
        } catch (Exception e) {
            Log.error("[DISCORD] Failed to queue the report notification", e);
        }
    }

    /**
     * The Discord webhook body for one report: a single embed titled with the report id and linking
     * to the website's reports page, the (truncated, code-fenced) message excerpt as description,
     * plus submission date, device summary and the quick-access link as fields.
     * {@code allowed_mentions} is pinned to parse-nothing so user text can never ping the channel.
     * Pure and static, so the shape and limits unit-test offline.
     */
    static String buildPayload(ReportEntity report, String websiteBaseUrl) {
        String reportsUrl = reportsPageUrl(websiteBaseUrl);

        JsonObject embed = new JsonObject();
        embed.addProperty("title", "New bug report #" + report.getId());
        embed.addProperty("url", reportsUrl);
        embed.addProperty("color", EMBED_COLOR);

        String message = truncate(nullToEmpty(report.getMessage()).trim(), MESSAGE_EXCERPT_MAX_CHARS);
        if (!message.isEmpty()) {
            embed.addProperty("description", codeBlock(message));
        }

        JsonArray fields = new JsonArray();
        LocalDate date = report.getReportingDate();
        if (date != null) {
            fields.add(field("Submitted", date.toString(), true));
        }
        String device = truncate(nullToEmpty(report.getDevice()).trim(), DEVICE_MAX_CHARS);
        if (!device.isEmpty()) {
            fields.add(field("Device", codeBlock(device), true));
        }
        fields.add(field("Quick access", reportsUrl, false));
        embed.add("fields", fields);

        JsonArray embeds = new JsonArray();
        embeds.add(embed);

        JsonObject allowedMentions = new JsonObject();
        allowedMentions.add("parse", new JsonArray());

        JsonObject root = new JsonObject();
        root.add("embeds", embeds);
        root.add("allowed_mentions", allowedMentions);
        return root.toString();
    }

    static String reportsPageUrl(String websiteBaseUrl) {
        String base = websiteBaseUrl.endsWith("/")
                ? websiteBaseUrl.substring(0, websiteBaseUrl.length() - 1)
                : websiteBaseUrl;
        return base + REPORTS_PAGE_PATH;
    }

    private static String nullToEmpty(String text) {
        return text == null ? "" : text;
    }

    private static String truncate(String text, int maxChars) {
        if (text.length() <= maxChars) {
            return text;
        }
        return text.substring(0, maxChars) + TRUNCATION_MARK;
    }

    /**
     * Wraps user text in a Discord code fence, which is what neutralises its markdown: inside a
     * fence nothing renders as formatting. The two things a fence does not cover are handled first:
     * a "```" in the text (which would close the fence early) gets zero-width spaces between its
     * backticks, and "@everyone"/"@here" get one after the "@" - belt to {@code allowed_mentions}'
     * braces, and it also keeps the text inert when copied out of the embed.
     */
    private static String codeBlock(String text) {
        String safe = neutralizeMentions(text.replace("```", "`" + ZWSP + "`" + ZWSP + "`"));
        return "```\n" + safe + "\n```";
    }

    private static String neutralizeMentions(String text) {
        return text.replace("@everyone", "@" + ZWSP + "everyone")
                .replace("@here", "@" + ZWSP + "here");
    }

    private static JsonObject field(String name, String value, boolean inline) {
        JsonObject field = new JsonObject();
        field.addProperty("name", name);
        field.addProperty("value", value);
        field.addProperty("inline", inline);
        return field;
    }

    /**
     * POSTs the payload to the webhook. Runs on the dedicated worker thread, bounded by the
     * connect/read timeouts, and swallows every failure into a log line - by design nothing that
     * happens here can reach a caller. The URL is deliberately absent from the logs: a Discord
     * webhook URL is a post-to-channel credential.
     */
    void postWebhook(String url, String payload) {
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
            try {
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setConnectTimeout(connectTimeoutMillis);
                connection.setReadTimeout(readTimeoutMillis);
                connection.setDoOutput(true);
                byte[] body = payload.getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body);
                }
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    Log.warn("[DISCORD] Report webhook answered HTTP " + status);
                }
            } finally {
                connection.disconnect();
            }
        } catch (Exception e) {
            Log.warn("[DISCORD] Report webhook delivery failed: " + e);
        }
    }

    @PreDestroy
    void shutdown() {
        webhookExecutor.shutdownNow();
    }
}

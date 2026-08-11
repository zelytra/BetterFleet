package fr.zelytra.reports;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Offline coverage for the Discord report notification: the embed payload (shape, truncation,
 * neutralised mentions/markdown, quick-access link) through the pure {@link
 * DiscordReportNotifier#buildPayload}, and the thin HTTP delivery against a throwaway JDK
 * HttpServer - no Quarkus, no network beyond loopback, no Discord.
 */
public class DiscordReportNotifierTest {

    private static ReportEntity report(int id, LocalDate date, String message, String device) {
        ReportEntity report = new ReportEntity();
        report.setId(id);
        report.setReportingDate(date);
        report.setMessage(message);
        report.setDevice(device);
        return report;
    }

    private static JsonObject parse(String payload) {
        return JsonParser.parseString(payload).getAsJsonObject();
    }

    private static JsonObject onlyEmbed(String payload) {
        JsonArray embeds = parse(payload).getAsJsonArray("embeds");
        assertEquals(1, embeds.size(), "The payload must carry exactly one embed");
        return embeds.get(0).getAsJsonObject();
    }

    private static String fieldValue(JsonObject embed, String name) {
        for (var element : embed.getAsJsonArray("fields")) {
            JsonObject field = element.getAsJsonObject();
            if (name.equals(field.get("name").getAsString())) {
                return field.get("value").getAsString();
            }
        }
        return null;
    }

    @Test
    public void payload_carriesIdDateDeviceAndQuickAccessLink() {
        String payload = DiscordReportNotifier.buildPayload(
                report(42, LocalDate.of(2026, 8, 11), "The overlay froze mid-countdown", "Windows 11 x64"),
                "https://betterfleet.fr");
        JsonObject embed = onlyEmbed(payload);

        assertEquals("New bug report #42", embed.get("title").getAsString());
        // The link lands on THE report: the page plus the card's own #report-<id> anchor.
        assertEquals("https://betterfleet.fr/reports#report-42", embed.get("url").getAsString());
        assertTrue(embed.get("description").getAsString().contains("The overlay froze mid-countdown"));
        assertEquals("2026-08-11", fieldValue(embed, "Submitted"));
        assertTrue(fieldValue(embed, "Device").contains("Windows 11 x64"));
        assertEquals("https://betterfleet.fr/reports#report-42", fieldValue(embed, "Quick access"));
    }

    @Test
    public void payload_linkSurvivesATrailingSlashOnTheBase() {
        String payload = DiscordReportNotifier.buildPayload(
                report(1, LocalDate.now(), "msg", null), "https://my-fleet.example/");
        assertEquals("https://my-fleet.example/reports#report-1", onlyEmbed(payload).get("url").getAsString());
    }

    @Test
    public void payload_carriesTheClientVersionWhenPresentAndOmitsItOtherwise() {
        ReportEntity versioned = report(9, LocalDate.now(), "msg", "pc");
        versioned.setVersion("2.3.2");
        assertEquals("2.3.2", fieldValue(onlyEmbed(
                DiscordReportNotifier.buildPayload(versioned, "https://betterfleet.fr")), "Version"));

        // Old clients send no version: the field simply does not appear, rather than an empty box.
        String withoutVersion = DiscordReportNotifier.buildPayload(
                report(9, LocalDate.now(), "msg", "pc"), "https://betterfleet.fr");
        assertEquals(null, fieldValue(onlyEmbed(withoutVersion), "Version"));
    }

    @Test
    public void payload_truncatesTheMessageWellUnderDiscordsLimit() {
        String payload = DiscordReportNotifier.buildPayload(
                report(7, LocalDate.now(), "x".repeat(20_000), "pc"), "https://betterfleet.fr");
        String description = onlyEmbed(payload).get("description").getAsString();

        assertTrue(description.contains(DiscordReportNotifier.TRUNCATION_MARK),
                "A cut excerpt must say so");
        assertTrue(description.length() < 4096 - 500,
                "The description must stay well under Discord's 4096-char cap, was " + description.length());
    }

    @Test
    public void payload_truncatesTheDeviceWellUnderDiscordsFieldLimit() {
        String payload = DiscordReportNotifier.buildPayload(
                report(7, LocalDate.now(), "msg", "y".repeat(5_000)), "https://betterfleet.fr");
        String device = fieldValue(onlyEmbed(payload), "Device");

        assertNotNull(device);
        assertTrue(device.contains(DiscordReportNotifier.TRUNCATION_MARK));
        assertTrue(device.length() < 1024 - 200,
                "The field value must stay well under Discord's 1024-char cap, was " + device.length());
    }

    @Test
    public void payload_neverLetsUserTextPingTheChannel() {
        String payload = DiscordReportNotifier.buildPayload(
                report(9, LocalDate.now(), "hey @everyone and @here look at this", "pc"),
                "https://betterfleet.fr");

        JsonArray parse = parse(payload).getAsJsonObject("allowed_mentions").getAsJsonArray("parse");
        assertEquals(0, parse.size(), "allowed_mentions.parse must be empty (mention nothing)");

        String description = onlyEmbed(payload).get("description").getAsString();
        assertFalse(description.contains("@everyone"), "@everyone must be broken up");
        assertFalse(description.contains("@here"), "@here must be broken up");
    }

    @Test
    public void payload_fencesUserTextAndKeepsItFromClosingTheFence() {
        String payload = DiscordReportNotifier.buildPayload(
                report(3, LocalDate.now(), "look ```diff\n+ pwned\n``` **bold** @everyone", "pc"),
                "https://betterfleet.fr");
        String description = onlyEmbed(payload).get("description").getAsString();

        assertTrue(description.startsWith("```\n") && description.endsWith("\n```"),
                "The excerpt must be wrapped in a code fence");
        String inner = description.substring(4, description.length() - 4);
        assertFalse(inner.contains("```"),
                "No fence may survive inside the block, or the user text escapes it");
    }

    @Test
    public void payload_skipsMissingMessageAndDevice() {
        String payload = DiscordReportNotifier.buildPayload(
                report(5, LocalDate.of(2026, 1, 2), null, "   "), "https://betterfleet.fr");
        JsonObject embed = onlyEmbed(payload);

        assertNull(embed.get("description"), "No message, no description");
        assertNull(fieldValue(embed, "Device"), "A blank device summary earns no field");
        assertEquals("2026-01-02", fieldValue(embed, "Submitted"));
    }

    @Test
    public void notifyReport_isANoOpWhenTheWebhookIsUnsetOrBlank() {
        DiscordReportNotifier notifier = new DiscordReportNotifier();
        notifier.webhookUrl = Optional.empty();
        assertDoesNotThrow(() -> notifier.notifyReport(report(1, LocalDate.now(), "msg", "pc")));

        notifier.webhookUrl = Optional.of("  ");
        assertDoesNotThrow(() -> notifier.notifyReport(report(1, LocalDate.now(), "msg", "pc")));
    }

    @Test
    public void notifyReport_deliversTheJsonToTheHookInTheBackground() throws Exception {
        AtomicReference<String> receivedBody = new AtomicReference<>();
        AtomicReference<String> receivedContentType = new AtomicReference<>();
        CountDownLatch delivered = new CountDownLatch(1);

        HttpServer hook = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        hook.createContext("/webhook", exchange -> {
            receivedBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            receivedContentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            delivered.countDown();
        });
        hook.start();
        try {
            DiscordReportNotifier notifier = new DiscordReportNotifier();
            notifier.webhookUrl = Optional.of(
                    "http://127.0.0.1:" + hook.getAddress().getPort() + "/webhook");
            notifier.websiteUrl = "https://betterfleet.fr";
            notifier.connectTimeoutMillis = 2000;
            notifier.readTimeoutMillis = 2000;

            notifier.notifyReport(report(11, LocalDate.of(2026, 8, 11), "SSE fell back to polling", "pc"));

            assertTrue(delivered.await(5, TimeUnit.SECONDS), "The hook was never called");
            assertEquals("application/json", receivedContentType.get());
            JsonObject embed = onlyEmbed(receivedBody.get());
            assertEquals("New bug report #11", embed.get("title").getAsString());
        } finally {
            hook.stop(0);
        }
    }

    @Test
    public void postWebhook_swallowsHttpErrorsAndDeadEndpoints() throws IOException {
        DiscordReportNotifier notifier = new DiscordReportNotifier();
        notifier.connectTimeoutMillis = 1000;
        notifier.readTimeoutMillis = 1000;

        // The hook answers 500: logged, never thrown.
        HttpServer hook = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        hook.createContext("/webhook", exchange -> {
            exchange.sendResponseHeaders(500, -1);
            exchange.close();
        });
        hook.start();
        int port = hook.getAddress().getPort();
        try {
            assertDoesNotThrow(() -> notifier.postWebhook("http://127.0.0.1:" + port + "/webhook", "{}"));
        } finally {
            hook.stop(0);
        }

        // Nothing listens any more: connection refused, still only logged.
        assertDoesNotThrow(() -> notifier.postWebhook("http://127.0.0.1:" + port + "/webhook", "{}"));

        // Not even a URL: the malformed-URL path is caught too.
        assertDoesNotThrow(() -> notifier.postWebhook("not a url", "{}"));
    }
}

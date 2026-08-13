package fr.zelytra.reports;

import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.logging.Log;
import io.quarkus.panache.common.Sort;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.LocalDate;
import java.util.List;

@Path("/report")
public class ReportEndpoints {

    /** A report carries its whole log capture, so a page is measured in megabytes: cap what one
     *  request can ask for rather than letting a caller pull the entire table in one go. */
    private static final int MAX_PAGE_SIZE = 50;

    @Inject
    DiscordReportNotifier discordReportNotifier;

    /** One page plus what a client needs to render pagination without a second round trip. */
    public record ReportPage(List<ReportEntity> items, int page, int amount, long total) {
    }

    /** Zero-based position of a report in the newest-first ordering. */
    public record ReportPosition(long position) {
    }

    @GET
    @Path("/list/all")
    @Transactional
    @Produces(MediaType.APPLICATION_JSON)
    public Response getAllReports() {
        Log.info("[GET] /report/list/all");
        return Response.ok(ReportEntity.findAll().list()).build();
    }

    /**
     * One page of reports, newest first.
     * <p>
     * The arguments used to reach Panache the wrong way round - {@code page(amount, page)} against a
     * {@code page(pageIndex, pageSize)} signature - so the first URL segment became the page size and
     * the second the page index: {@code /list/0/5} asked for a page size of 0 and threw a 500, and
     * every other call quietly returned the wrong slice (#823).
     * <p>
     * The ordering is explicit and descending: without it the database is free to return rows in any
     * order, so a report could appear on two pages or on none, and "newest first" is what a reader
     * of a bug-report list wants. It also makes the envelope's {@code total} meaningful, which is
     * what lets a paginated client know how many pages exist.
     */
    @GET
    @Path("/list/{page}/{amount}")
    @Transactional
    @Produces(MediaType.APPLICATION_JSON)
    public Response getReports(@PathParam("page") int page, @PathParam("amount") int amount) {
        Log.info("[GET] /report/list/" + page + "/" + amount);
        if (page < 0 || amount < 1 || amount > MAX_PAGE_SIZE) {
            // Panache throws IllegalArgumentException on a page size of 0, which surfaces as a 500:
            // a caller's bad input is a 400, and the cap keeps one request from serving the whole
            // table (a report carries its full log capture, so a page is measured in megabytes).
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("page must be >= 0 and amount between 1 and " + MAX_PAGE_SIZE)
                    .type(MediaType.TEXT_PLAIN)
                    .build();
        }
        PanacheQuery<ReportEntity> query = ReportEntity.findAll(Sort.by("id", Sort.Direction.Descending));
        return Response.ok(new ReportPage(query.page(page, amount).list(), page, amount, query.count())).build();
    }

    /**
     * Where a report sits in the newest-first ordering, so a deep link can open the page holding it.
     * <p>
     * The reports page links to a report by database id ({@code /reports#report-801}), including from
     * the Discord webhook. Once the list is paginated that id is not necessarily on the first page,
     * and the id cannot be turned into a position client-side: Hibernate hands ids out in blocks of
     * 50, so they are not contiguous. One count answers it exactly.
     */
    @GET
    @Path("/{id}/position")
    @Transactional
    @Produces(MediaType.APPLICATION_JSON)
    public Response getReportPosition(@PathParam("id") int id) {
        Log.info("[GET] /report/" + id + "/position");
        if (ReportEntity.count("id = ?1", id) == 0) {
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        // Newest first, so the position is the number of reports newer than this one.
        long position = ReportEntity.count("id > ?1", id);
        return Response.ok(new ReportPosition(position)).build();
    }

    @POST
    @Path("/send")
    @Transactional
    @Authenticated
    public Response sendReport(ReportEntity report) {
        Log.info("[POST] /report/send");
        report.setReportingDate(LocalDate.now());
        report.persist();
        // Fire-and-forget: builds the payload here (cheap, never throws out) and hands delivery to
        // the notifier's own thread, so the response below is identical with the webhook on, off,
        // or Discord down.
        discordReportNotifier.notifyReport(report);
        return Response.ok().build();
    }
}

package fr.zelytra.reports;

import io.quarkus.security.Authenticated;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Response;

import java.util.Date;

@Path("/report")
public class ReportEndpoints {

    @GET
    @Path("/list/{page}/{amount}")
    @Transactional
    public Response getReports(@PathParam("amount") int amount, @PathParam("page") int page) {
        return Response.ok(ReportEntity.findAll().page(amount, page)).build();
    }

    @POST
    @Path("/send")
    @Transactional
    @Authenticated
    public Response sendReport(ReportEntity report) {
        report.setReportingDate(new Date());
        report.persist();
        return Response.ok().build();
    }
}

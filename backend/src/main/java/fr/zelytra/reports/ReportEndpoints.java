package fr.zelytra.reports;

import io.quarkus.logging.Log;
import io.quarkus.security.Authenticated;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.Date;

@Path("/report")
public class ReportEndpoints {

    @GET
    @Path("/list/all")
    @Transactional
    @Produces(MediaType.APPLICATION_JSON)
    public Response getAllReports() {
        Log.info("[GET] /report/list/all");
        return Response.ok(ReportEntity.findAll().list()).build();
    }

    @GET
    @Path("/list/{page}/{amount}")
    @Transactional
    @Produces(MediaType.APPLICATION_JSON)
    public Response getReports(@PathParam("amount") int amount, @PathParam("page") int page) {
        Log.info("[GET] /report/list/" + page + "/" + amount);
        return Response.ok(ReportEntity.findAll().page(amount, page).list()).build();
    }

    @POST
    @Path("/send")
    @Transactional
    @Authenticated
    public Response sendReport(ReportEntity report) {
        Log.info("[GET] /report/send");
        report.setReportingDate(new Date());
        report.persist();
        return Response.ok().build();
    }
}

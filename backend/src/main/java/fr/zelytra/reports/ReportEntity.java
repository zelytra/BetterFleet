package fr.zelytra.reports;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.Date;

@Entity
@Table(name = "reporting")
public class ReportEntity extends PanacheEntityBase {

    @Column(name = "date", columnDefinition = "date")
    private Date reportingDate;

    @Id
    @Column(name = "id", unique = true, columnDefinition = "int")
    private int id;

    @Column(name = "message", columnDefinition = "text")
    private String message;

    @Column(name = "logs", columnDefinition = "text")
    private String logs;

    @Column(name = "device", columnDefinition = "text")
    private String device;

    public ReportEntity() {
    }

    public Date getReportingDate() {
        return reportingDate;
    }

    public void setReportingDate(Date reportingDate) {
        this.reportingDate = reportingDate;
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getLogs() {
        return logs;
    }

    public void setLogs(String logs) {
        this.logs = logs;
    }
}

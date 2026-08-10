package fr.zelytra.reports;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;

import java.time.LocalDate;

@Entity
@Table(name = "reporting")
public class ReportEntity extends PanacheEntityBase {

    // LocalDate, not java.util.Date: the column is a plain SQL date, and mapping it as a timestamp
    // made Jackson serialize "midnight in the JVM's zone" converted to UTC — the payload could carry
    // the previous day (2024-11-02 became 2024-11-01T23:00:00Z). LocalDate serializes as the stored
    // calendar date ("2024-11-02"), which is the only thing this field ever meant.
    @Column(name = "date", columnDefinition = "date")
    private LocalDate reportingDate;

    @Id
    @GeneratedValue
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

    public LocalDate getReportingDate() {
        return reportingDate;
    }

    public void setReportingDate(LocalDate reportingDate) {
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

    public String getDevice() {
        return device;
    }

    public void setDevice(String device) {
        this.device = device;
    }
}

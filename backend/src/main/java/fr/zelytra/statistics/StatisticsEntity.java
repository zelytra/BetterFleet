package fr.zelytra.statistics;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

@Entity
@Table(name = "statistics", schema = "betterfleet")
public class StatisticsEntity extends PanacheEntityBase {

    @Id
    @Column(name = "date",columnDefinition = "date",unique = true)
    private LocalDate date;

    @Column(name = "download")
    private int download;

    @Column(name = "session_open")
    private int sessionsOpen;

    @Column(name = "session_try")
    private int sessionTry;

    public StatisticsEntity(){
        this.date = LocalDate.now();
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public int getDownload() {
        return download;
    }

    public void setDownload(int download) {
        this.download = download;
    }

    public int getSessionsOpen() {
        return sessionsOpen;
    }

    public void setSessionsOpen(int sessionsOpen) {
        this.sessionsOpen = sessionsOpen;
    }

    public int getSessionTry() {
        return sessionTry;
    }

    public void setSessionTry(int sessionTry) {
        this.sessionTry = sessionTry;
    }
}

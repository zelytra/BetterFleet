package fr.zelytra.statistics;

import io.quarkus.hibernate.orm.panache.PanacheRepository;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.LocalDate;

@ApplicationScoped
public class StatisticsRepository implements PanacheRepository<StatisticsEntity> {

    public StatisticsEntity getEntity() {
        StatisticsEntity entity = StatisticsEntity.findById(LocalDate.now());
        if (entity == null) {
            entity = new StatisticsEntity();
            entity.persist();
        }
        return entity;
    }

    public static void incrementSession() {
        StatisticsEntity entity = StatisticsEntity.findById(LocalDate.now());
        if (entity == null) {
            entity = new StatisticsEntity();
            entity.persist();
        }
        entity.setSessionsOpen(entity.getSessionsOpen() + 1);
    }
}

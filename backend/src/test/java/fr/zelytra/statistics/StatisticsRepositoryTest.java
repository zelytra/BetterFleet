package fr.zelytra.statistics;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;

@QuarkusTest
public class StatisticsRepositoryTest {

    @Inject
    StatisticsRepository statisticsRepository;

    @BeforeEach
    @Transactional
    void setUp() {
        // Clean up the database to ensure a consistent starting state for each test
        StatisticsEntity.deleteAll();
    }

    @Test
    @Transactional
    void testGetEntityWhenExists() {
        // Arrange: Create and persist an entity for today's date
        StatisticsEntity expectedEntity = new StatisticsEntity();
        expectedEntity.persist();

        // Act: Retrieve the entity via the repository
        StatisticsEntity result = statisticsRepository.getEntity();

        // Assert: The entity is found
        assertNotNull(result);
    }

    @Test
    @Transactional
    void testGetEntityWhenNotExists() {
        // Act: Attempt to retrieve an entity when none exists
        StatisticsEntity result = statisticsRepository.getEntity();

        // Assert: A new entity is created and returned
        assertNotNull(result);
    }
}

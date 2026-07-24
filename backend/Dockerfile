# Build stage
FROM maven:3.8.3-openjdk-17 AS build
WORKDIR /app
# Resolve dependencies in their own layer: a source-only change no longer re-downloads the world.
COPY pom.xml ./
RUN mvn -B dependency:go-offline
# Build the Quarkus app. The quarkus-maven-plugin runs during `package`, so no separate quarkus:build goal.
COPY src ./src
RUN mvn -B -Dmaven.test.skip=true -Dquarkus.profile=prod package

# Package stage
FROM registry.access.redhat.com/ubi8/openjdk-17:latest
ENV LANGUAGE='en_US:en'
# Four distinct layers so unchanged libraries stay cached across app-only changes.
COPY --from=build --chown=185 /app/target/quarkus-app/lib/ /deployments/lib/
COPY --from=build --chown=185 /app/target/quarkus-app/*.jar /deployments/
COPY --from=build --chown=185 /app/target/quarkus-app/app/ /deployments/app/
COPY --from=build --chown=185 /app/target/quarkus-app/quarkus/ /deployments/quarkus/

EXPOSE 8080
USER 185
ENV JAVA_OPTS="-Dquarkus.http.host=0.0.0.0 -Djava.util.logging.manager=org.jboss.logmanager.LogManager"
ENV JAVA_APP_JAR="/deployments/quarkus-run.jar"

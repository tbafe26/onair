# 빌드에는 JDK가, 실행에는 JRE만 필요하므로 단계를 나눠 실행 이미지를 줄인다. 둘 다 공식 Eclipse Temurin 이미지다.
FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY gradlew settings.gradle.kts build.gradle.kts gradle.properties ./
COPY gradle gradle
COPY src/main src/main
RUN ./gradlew --no-daemon bootJar

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /src/build/libs/*.jar app.jar
USER ubuntu
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]

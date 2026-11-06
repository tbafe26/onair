plugins {
    java
    id("org.springframework.boot") version "4.1.2"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.onair"
version = "0.2.0-SNAPSHOT"
description = "onair backend"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-websocket")
    runtimeOnly("com.h2database:h2")

    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
    useJUnitPlatform()
    // 테스트 JVM은 짧게 살다 끝나므로 JIT 최적화 단계를 낮춰 Spring 컨텍스트 기동을 앞당긴다.
    jvmArgs("-XX:TieredStopAtLevel=1")
    // 실패한 테스트는 리포트 파일을 열지 않아도 콘솔에서 원인을 볼 수 있게 한다.
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

// 컴파일 경고를 오류로 처리해 경고가 쌓이지 않게 한다. main과 test 모두 적용한다.
tasks.withType<JavaCompile> {
    options.compilerArgs.addAll(listOf("-Xlint:all", "-Werror"))
}

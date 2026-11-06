plugins {
    java
    id("org.springframework.boot") version "4.1.2"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.onair"
version = "0.4.0"
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
    implementation("org.springframework.boot:spring-boot-starter-security")
    runtimeOnly("com.h2database:h2")

    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
    useJUnitPlatform()
    // 계약 파일이 바뀌면 캐시된 결과를 쓰지 않고 테스트를 다시 돌린다.
    inputs.file("../contracts/signaling.json")
    inputs.file("../contracts/broadcast-responses.json")
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

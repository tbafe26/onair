package com.onair.broadcast;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * MockMvc API 테스트의 공통 바탕.
 *
 * <p>설정이 같은 테스트 클래스들은 Spring 컨텍스트 하나를 함께 쓴다. 클래스마다 설정 값(임시 폴더 경로 등)을 다르게 주면
 * 컨텍스트 캐시가 깨져 클래스마다 Spring을 새로 띄우므로, 저장 폴더는 테스트 설정의 고정 경로를 쓰고
 * 테스트마다 DB와 저장 폴더를 비워 서로 간섭하지 않게 한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestClockConfig.class)
abstract class ApiTestSupport {

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected BroadcastRepository repository;

    @Autowired
    protected MutableClock clock;

    @Autowired
    protected JdbcTemplate jdbc;

    @Value("${app.storage.dir}")
    protected Path storageDir;

    @BeforeEach
    void 방송과_저장_폴더를_비운다() throws IOException {
        // DB 시각 정밀도보다 거칠게 맞춰, 저장하기 전과 읽은 뒤의 시각이 같게 한다.
        clock.set(Instant.now().truncatedTo(ChronoUnit.MILLIS));
        repository.deleteAll();
        // 녹화방송은 영상을 PERSIST로만 연결해 방송을 지워도 영상 행이 남는다. 남으면 앞선 테스트의 영상이 섞인다.
        jdbc.update("delete from video");
        Files.createDirectories(storageDir);
        try (var files = Files.list(storageDir)) {
            for (Path file : files.toList()) {
                Files.delete(file);
            }
        }
    }
}

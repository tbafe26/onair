package com.onair.broadcast;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;

/**
 * 배포된 버전이 만든 스키마 위에서 지금의 코드를 운영 설정(ddl-auto=update)으로 띄워, 모든 방송 종류를 저장하고 읽을 수 있는지 본다.
 *
 * <p>스냅샷마다 Spring 컨텍스트가 하나씩 필요하다. DB 상태가 다르고, 테스트의 기본 설정(create-drop, 빈 메모리 DB)으로는
 * 업그레이드 경로를 만나지 못하기 때문이다. 새 릴리스를 낼 때는 {@code src/test/resources/schema/}에 스냅샷을 넣고
 * 이 클래스를 상속하는 클래스를 하나 더 둔다.
 */
abstract class SchemaUpgradeTestBase extends ApiTestSupport {

    // 4~7번째 바이트가 ftyp인 작은 mp4 흉내 바이트
    static final byte[] MP4_BYTES = {
            0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8};

    /** Spring이 뜨기 전에 스냅샷으로 H2 파일 DB를 만들고, 앱이 그 DB를 쓰도록 운영과 같은 설정을 건다. */
    static void 스냅샷_DB를_쓴다(DynamicPropertyRegistry registry, String snapshot) {
        Path dbFile = Path.of("build", "schema-upgrade", snapshot + "-" + UUID.randomUUID());
        String url = "jdbc:h2:file:" + dbFile.toAbsolutePath().toString().replace(java.io.File.separatorChar, '/');
        try {
            Files.createDirectories(dbFile.getParent());
            // 연결을 닫으면 DB 파일이 닫혀, 이후 앱이 이전 릴리스가 남긴 파일을 여는 것과 같아진다.
            try (Connection connection = DriverManager.getConnection(url, "sa", "")) {
                connection.createStatement().execute("RUNSCRIPT FROM 'classpath:schema/" + snapshot + ".sql'");
            }
        } catch (SQLException | java.io.IOException e) {
            throw new IllegalStateException("스냅샷을 불러오지 못했다: " + snapshot, e);
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "update");
    }

    @Test
    void 업그레이드한_DB에서_녹화방송과_라이브방송을_저장하고_읽을_수_있다() throws Exception {
        mockMvc.perform(multipart("/api/broadcasts")
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", MP4_BYTES))
                        .param("title", "업그레이드 녹화"))
                .andExpect(status().isCreated());
        mockMvc.perform(multipart("/api/broadcasts/live").param("title", "업그레이드 라이브"))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/broadcasts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[?(@.kind == 'LIVE')].title").value("업그레이드 라이브"))
                .andExpect(jsonPath("$.items[?(@.kind == 'RECORDING')].title").value("업그레이드 녹화"));
    }
}

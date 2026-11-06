package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.auth.AuthClient;
import com.onair.media.MediaStorage;
import com.onair.support.ApiTestSupport;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.transaction.PlatformTransactionManager;

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
        mockMvc.perform(multipart("/api/broadcasts").with(owner().credentials())
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", MP4_BYTES))
                        .param("title", "업그레이드 녹화"))
                .andExpect(status().isCreated());
        mockMvc.perform(multipart("/api/broadcasts/live").with(owner().credentials()).param("title", "업그레이드 라이브"))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/broadcasts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[?(@.kind == 'LIVE')].title").value("업그레이드 라이브"))
                .andExpect(jsonPath("$.items[?(@.kind == 'RECORDING')].title").value("업그레이드 녹화"));
    }

    @Autowired
    OwnerlessBroadcastCleanup cleanup;

    @Autowired
    MediaStorage storage;

    @Autowired
    PlatformTransactionManager transactionManager;

    /** 소유자 컬럼이 생기기 전에 올라온 방송을 흉내 낸다. 파일을 만들지 않으면 이미 사라진 파일이다. */
    void 소유자_없는_녹화방송을_넣는다(long id, String key, boolean withFiles) throws IOException {
        jdbc.update("insert into video (id, storage_key, original_filename, content_type, size_bytes, thumbnail_key) "
                + "values (?, ?, 'old.mp4', 'video/mp4', 24, ?)", id, key + "-video", key + "-thumb");
        jdbc.update("insert into broadcast (id, kind, title, created_at) values (?, 'RECORDING', '옛 녹화', ?)",
                id, OffsetDateTime.now());
        jdbc.update("insert into recording_broadcast (id, video_id) values (?, ?)", id, id);
        if (withFiles) {
            Files.write(storageDir.resolve(key + "-video"), MP4_BYTES);
            Files.write(storageDir.resolve(key + "-thumb"), new byte[] {1, 2});
        }
    }

    void 소유자_없는_라이브방송을_넣는다(long id, String key) throws IOException {
        jdbc.update("insert into broadcast (id, kind, title, created_at) values (?, 'LIVE', '옛 라이브', ?)",
                id, OffsetDateTime.now());
        jdbc.update("insert into live_broadcast (id, status, stream_key_hash, thumbnail_key) "
                + "values (?, 'ENDED', 'hash', ?)", id, key + "-thumb");
        Files.write(storageDir.resolve(key + "-thumb"), new byte[] {1, 2});
    }

    @Test
    void 소유자_없는_방송과_영상_행과_파일은_지워지고_소유자_있는_방송은_남는다() throws Exception {
        owner();
        mockMvc.perform(multipart("/api/broadcasts").with(owner().credentials())
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", MP4_BYTES))
                        .param("title", "내 녹화"))
                .andExpect(status().isCreated());
        소유자_없는_녹화방송을_넣는다(9001, "old-rec", true);
        소유자_없는_라이브방송을_넣는다(9002, "old-live");
        소유자_없는_녹화방송을_넣는다(9003, "old-gone", false);

        cleanup.cleanUp();

        assertThat(jdbc.queryForList("select title from broadcast", String.class)).containsExactly("내 녹화");
        assertThat(jdbc.queryForObject("select count(*) from video", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from live_broadcast", Integer.class)).isZero();
        assertThat(Files.exists(storageDir.resolve("old-rec-video"))).isFalse();
        assertThat(Files.exists(storageDir.resolve("old-rec-thumb"))).isFalse();
        assertThat(Files.exists(storageDir.resolve("old-live-thumb"))).isFalse();
        try (var files = Files.list(storageDir)) {
            assertThat(files.count()).as("소유자 있는 방송의 파일은 남는다").isEqualTo(1);
        }
    }

    @Test
    void 두_번째_실행은_할_일이_없다() throws Exception {
        소유자_없는_녹화방송을_넣는다(9001, "old-rec", true);

        assertThat(cleanup.cleanUp()).isEqualTo(1);
        assertThat(cleanup.cleanUp()).isZero();
    }

    @Test
    void 파일_삭제가_실패해도_행은_지워지고_멈추지_않는다() throws Exception {
        소유자_없는_녹화방송을_넣는다(9001, "old-rec", true);
        MediaStorage failing = new MediaStorage() {
            @Override
            public Batch begin() {
                return storage.begin();
            }

            @Override
            public Optional<org.springframework.core.io.Resource> open(String key) {
                return storage.open(key);
            }

            @Override
            public void delete(String key) {
                throw new java.io.UncheckedIOException(new IOException("삭제 실패"));
            }
        };

        new OwnerlessBroadcastCleanup(jdbc, failing, transactionManager).cleanUp();

        assertThat(jdbc.queryForObject("select count(*) from broadcast", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from video", Integer.class)).isZero();
    }

    @Test
    void 업그레이드한_DB에서_새_가입과_등록이_된다() throws Exception {
        소유자_없는_녹화방송을_넣는다(9001, "old-rec", true);
        cleanup.cleanUp();

        AuthClient fresh = AuthClient.signedUp(mockMvc, "newuser1", "새내기");
        mockMvc.perform(multipart("/api/broadcasts/live").with(fresh.credentials()).param("title", "새 라이브"))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/broadcasts"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].owner.nickname").value("새내기"));
    }
}

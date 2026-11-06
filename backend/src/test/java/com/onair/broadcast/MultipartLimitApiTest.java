package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;

import com.onair.auth.Csrf;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * 멀티파트 요청 상한. MockMvc는 서블릿 컨테이너의 요청 상한을 거치지 않으므로 실제 서버를 띄워 HTTP로 확인한다.
 * 영상 상한은 4KB로 낮춘다.
 *
 * <p>ApiTestSupport를 상속하지 않는 이유: 그쪽은 MockMvc(MOCK 환경)라 컨테이너가 없고, 이 테스트는 실제 포트로 HTTP를 보내야 한다.
 * 또 상한 값(@DynamicPropertySource)이 달라 어차피 Spring 컨텍스트를 따로 띄운다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MultipartLimitApiTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.upload.max-size", () -> "4KB");
    }

    @LocalServerPort
    int port;

    static final int VIDEO_LIMIT = 4 * 1024;
    static final byte[] JPEG_HEADER = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0};

    static byte[] mp4(int size) {
        byte[] bytes = new byte[size];
        byte[] ftyp = {'f', 't', 'y', 'p'};
        System.arraycopy(ftyp, 0, bytes, 4, 4);
        return bytes;
    }

    static byte[] jpeg(int size) {
        return Arrays.copyOf(JPEG_HEADER, size);
    }

    static ByteArrayResource file(byte[] bytes, String name) {
        return new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }

    /** 가입해서 로그인한 사용자의 Cookie 헤더 값. DB를 비우지 않는 테스트라 아이디는 매번 새로 만든다. */
    String 로그인한_쿠키() {
        return RealPortLogin.signUp(port, "u" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 12), "소유자닉");
    }

    ResponseEntity<String> 등록한다(byte[] video, byte[] thumbnail) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("title", "상한 테스트");
        body.add("video", file(video, "v.mp4"));
        if (thumbnail != null) {
            body.add("thumbnail", file(thumbnail, "t.jpg"));
        }
        return RestClient.create("http://localhost:" + port)
                .post()
                .uri("/api/broadcasts")
                .header("Cookie", 로그인한_쿠키())
                .header(Csrf.HEADER, Csrf.TOKEN)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .onStatus(status -> true, (request, response) -> { })
                .toEntity(String.class);
    }

    @Test
    void 상한_바로_아래_크기의_영상에_썸네일을_더해도_등록된다() {
        ResponseEntity<String> response = 등록한다(mp4(VIDEO_LIMIT - 10), jpeg(1500));

        assertThat(response.getStatusCode().value()).isEqualTo(201);
    }

    @Test
    void 영상이_상한을_넘으면_413이고_상한_값을_담는다() {
        ResponseEntity<String> response = 등록한다(mp4(VIDEO_LIMIT + 1), null);

        assertThat(response.getStatusCode().value()).isEqualTo(413);
        assertThat(response.getBody()).contains("\"maxBytes\":" + VIDEO_LIMIT);
        assertThat(response.getBody()).contains("영상은 4KB 이하만 올릴 수 있습니다");
    }
}

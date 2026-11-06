package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.support.ApiTestSupport;
import java.nio.file.Files;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/** DB 기록 실패와 예기치 못한 오류: 저장한 파일이 남지 않고 500 ProblemDetail로 응답한다. */
class BroadcastRegistrationFailureApiTest extends ApiTestSupport {

    // 스파이 빈은 컨텍스트 캐시 키를 바꾸므로 이 클래스만 따로 컨텍스트를 띄운다.
    @MockitoSpyBean
    BroadcastRepository repositorySpy;

    static final byte[] MP4_BYTES = {0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 1, 2, 3};
    static final byte[] JPEG_BYTES = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 9, 8};

    @Test
    void DB_기록이_실패하면_영상과_썸네일_파일을_모두_지우고_500이다() throws Exception {
        doThrow(new DataAccessResourceFailureException("DB 내려감")).when(repositorySpy).save(any());

        mockMvc.perform(multipart("/api/broadcasts").with(owner().credentials())
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", MP4_BYTES))
                        .file(new MockMultipartFile("thumbnail", "t.jpg", "image/jpeg", JPEG_BYTES))
                        .param("title", "실패할 방송"))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(500))
                // 내부 오류 메시지는 응답에 싣지 않는다.
                .andExpect(jsonPath("$.detail").value(Matchers.not(Matchers.containsString("DB 내려감"))));

        try (var files = Files.list(storageDir)) {
            assertThat(files.toList()).isEmpty();
        }
    }
}

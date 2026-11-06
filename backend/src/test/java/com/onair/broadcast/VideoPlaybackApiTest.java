package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.auth.Csrf;
import java.nio.file.Path;
import java.util.Arrays;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

class VideoPlaybackApiTest extends ApiTestSupport {

    // 4~7번째 바이트가 ftyp인 100바이트 영상. 바이트 값이 위치마다 달라 범위가 맞는지 확인할 수 있다.
    static final byte[] VIDEO_BYTES = new byte[100];

    static {
        for (int i = 0; i < VIDEO_BYTES.length; i++) {
            VIDEO_BYTES[i] = (byte) i;
        }
        byte[] ftyp = {'f', 't', 'y', 'p'};
        System.arraycopy(ftyp, 0, VIDEO_BYTES, 4, 4);
    }

    String videoPath;

    @BeforeEach
    void 영상을_등록한다() throws Exception {
        MvcResult created = mockMvc.perform(multipart("/api/broadcasts").with(Csrf.token())
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", VIDEO_BYTES))
                        .param("title", "재생 테스트"))
                .andExpect(status().isCreated())
                .andReturn();
        videoPath = created.getResponse().getHeader("Location") + "/video";
    }

    @Test
    void Range가_없으면_200과_전체_파일을_돌려준다() throws Exception {
        MvcResult result = mockMvc.perform(get(videoPath))
                .andExpect(status().isOk())
                .andExpect(header().string("Accept-Ranges", "bytes"))
                .andExpect(header().string("Content-Type", "video/mp4"))
                .andReturn();

        assertThat(result.getResponse().getContentAsByteArray()).isEqualTo(VIDEO_BYTES);
    }

    @Test
    void Range가_있으면_206과_해당_바이트와_Content_Range를_돌려준다() throws Exception {
        MvcResult result = mockMvc.perform(get(videoPath).header("Range", "bytes=10-19"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 10-19/100"))
                .andExpect(header().string("Accept-Ranges", "bytes"))
                .andExpect(header().string("Content-Type", "video/mp4"))
                .andReturn();

        assertThat(result.getResponse().getContentAsByteArray())
                .isEqualTo(Arrays.copyOfRange(VIDEO_BYTES, 10, 20));
    }

    @Test
    void 끝을_생략한_Range는_파일_끝까지_돌려준다() throws Exception {
        MvcResult result = mockMvc.perform(get(videoPath).header("Range", "bytes=90-"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 90-99/100"))
                .andReturn();

        assertThat(result.getResponse().getContentAsByteArray())
                .isEqualTo(Arrays.copyOfRange(VIDEO_BYTES, 90, 100));
    }

    @Test
    void 파일_크기를_벗어난_Range는_416이다() throws Exception {
        MvcResult result = mockMvc.perform(get(videoPath).header("Range", "bytes=500-600"))
                .andExpect(status().isRequestedRangeNotSatisfiable())
                .andExpect(header().string("Content-Range", "bytes */100"))
                .andReturn();

        // 416 응답에 영상 전체를 실어 보내지 않고 ProblemDetail 본문만 담는다.
        assertThat(result.getResponse().getContentType()).startsWith("application/problem+json");
        assertThat(result.getResponse().getContentAsString()).contains("\"status\":416");
    }

    @Test
    void 형식이_잘못된_Range는_416이다() throws Exception {
        mockMvc.perform(get(videoPath).header("Range", "bytes=abc"))
                .andExpect(status().isRequestedRangeNotSatisfiable());
    }

    @Test
    void 없는_방송의_영상_조회는_404다() throws Exception {
        mockMvc.perform(get("/api/broadcasts/999999/video"))
                .andExpect(status().isNotFound());
    }

    @Test
    void 저장된_파일이_사라진_영상_조회는_404다() throws Exception {
        try (var files = java.nio.file.Files.list(storageDir)) {
            for (Path file : files.toList()) {
                java.nio.file.Files.delete(file);
            }
        }

        mockMvc.perform(get(videoPath))
                .andExpect(status().isNotFound());
    }
}

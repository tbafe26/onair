package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.auth.Csrf;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class ThumbnailApiTest extends ApiTestSupport {

    static final byte[] MP4_BYTES = {0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0};
    static final byte[] JPEG_BYTES = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 9, 8, 7};

    @Test
    void 저장된_썸네일_파일이_사라지면_404_ProblemDetail이다() throws Exception {
        String location = mockMvc.perform(multipart("/api/broadcasts").with(Csrf.token())
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", MP4_BYTES))
                        .file(new MockMultipartFile("thumbnail", "t.jpg", "image/jpeg", JPEG_BYTES))
                        .param("title", "썸네일 삭제"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getHeader("Location");
        String thumbnailPath = location + "/thumbnail";
        mockMvc.perform(get(thumbnailPath)).andExpect(status().isOk());

        // 썸네일 파일만 지운다. 영상 파일은 JPEG 시그니처가 아니므로 구분할 수 있다.
        try (var files = Files.list(storageDir)) {
            for (Path file : files.toList()) {
                if (Files.readAllBytes(file)[0] == (byte) 0xFF) {
                    Files.delete(file);
                }
            }
        }

        mockMvc.perform(get(thumbnailPath))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(404));
        try (var files = Files.list(storageDir)) {
            assertThat(files.count()).isEqualTo(1);
        }
    }

    @Test
    void 썸네일_없는_방송의_썸네일_요청은_썸네일_없음_404이고_없는_방송은_방송_없음_404이다() throws Exception {
        String location = mockMvc.perform(multipart("/api/broadcasts").with(Csrf.token())
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", MP4_BYTES))
                        .param("title", "썸네일 없는 방송"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getHeader("Location");

        mockMvc.perform(get(location + "/thumbnail"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.title").value("썸네일 없음"))
                .andExpect(jsonPath("$.detail").value("이 방송에는 썸네일이 없습니다"));

        mockMvc.perform(get("/api/broadcasts/999999/thumbnail"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("방송 없음"));
    }

    @Test
    void 숫자가_아닌_방송_id는_없는_방송처럼_404_ProblemDetail이다() throws Exception {
        for (String path : new String[] {"/abc", "/abc/video", "/abc/thumbnail"}) {
            mockMvc.perform(get("/api/broadcasts" + path))
                    .andExpect(status().isNotFound())
                    .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                    .andExpect(jsonPath("$.title").value("방송 없음"));
        }
    }
}

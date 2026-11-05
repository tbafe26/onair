package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

/**
 * 등록 입력 검증이 HTTP 오류 응답(ProblemDetail)으로 나오는지 확인한다.
 * 상한별 규칙은 RegistrationRulesTest가 Spring 없이 확인하고, 실제 서버의 413은 MultipartLimitApiTest가 확인한다.
 */
class BroadcastValidationApiTest extends ApiTestSupport {

    static final byte[] MP4_BYTES = {
            0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0, 1, 2, 3, 4};
    static final byte[] WEBM_BYTES = {0x1A, 0x45, (byte) 0xDF, (byte) 0xA3, 1, 2, 3, 4, 5, 6, 7, 8};
    static final byte[] JPEG_BYTES = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 9, 8, 7};

    MockMultipartHttpServletRequestBuilder 요청(String title, byte[] video) {
        MockMultipartHttpServletRequestBuilder builder = multipart("/api/broadcasts");
        if (video != null) {
            // 파일 이름과 Content-Type은 일부러 항상 mp4로 보낸다. 판정에 쓰이지 않아야 한다.
            builder.file(new MockMultipartFile("video", "fake.mp4", "video/mp4", video));
        }
        if (title != null) {
            builder.param("title", title);
        }
        return builder;
    }

    void 필드_오류를_기대한다(ResultActions result, String field) throws Exception {
        result.andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.title").isString())
                .andExpect(jsonPath("$.errors[?(@.field == '" + field + "')].reason").isNotEmpty());
        assertThat(저장된_파일_수()).isZero();
    }

    long 저장된_파일_수() throws IOException {
        try (var files = Files.list(storageDir)) {
            return files.count();
        }
    }

    @Test
    void 빈_제목은_400이다() throws Exception {
        필드_오류를_기대한다(mockMvc.perform(요청("", MP4_BYTES)), "title");
    }

    @Test
    void 제목이_없으면_400이다() throws Exception {
        필드_오류를_기대한다(mockMvc.perform(요청(null, MP4_BYTES)), "title");
    }

    @Test
    void 공백만_있는_제목은_400이다() throws Exception {
        필드_오류를_기대한다(mockMvc.perform(요청("   \t ", MP4_BYTES)), "title");
    }

    @Test
    void 제목이_100자를_넘으면_400이다() throws Exception {
        필드_오류를_기대한다(mockMvc.perform(요청("가".repeat(101), MP4_BYTES)), "title");
    }

    @Test
    void 앞뒤_공백을_뗀_제목이_100자면_등록된다() throws Exception {
        mockMvc.perform(요청("  " + "가".repeat(100) + "  ", MP4_BYTES))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("가".repeat(100)));
    }

    @Test
    void 영상이_없으면_400이다() throws Exception {
        필드_오류를_기대한다(mockMvc.perform(요청("제목", null)), "video");
    }

    @Test
    void 확장자만_mp4인_가짜_파일은_400이다() throws Exception {
        필드_오류를_기대한다(mockMvc.perform(요청("제목", "이건 영상이 아니라 글자입니다".getBytes())), "video");
    }

    @Test
    void 시그니처가_맞으면_mp4와_webm_모두_받고_형식은_판정_결과로_정한다() throws Exception {
        mockMvc.perform(요청("mp4", MP4_BYTES))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.video.contentType").value("video/mp4"));
        // 확장자와 Content-Type이 mp4여도 webm 시그니처면 webm으로 저장한다.
        mockMvc.perform(요청("webm", WEBM_BYTES))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.video.contentType").value("video/webm"));
    }

    @Test
    void 썸네일이_JPEG가_아니면_400이다() throws Exception {
        필드_오류를_기대한다(mockMvc.perform(요청("제목", MP4_BYTES)
                .file(new MockMultipartFile("thumbnail", "t.jpg", "image/jpeg", "not a jpeg".getBytes()))),
                "thumbnail");
    }

    @Test
    void 썸네일이_2MB를_넘으면_400이다() throws Exception {
        byte[] big = new byte[2 * 1024 * 1024 + 1];
        System.arraycopy(JPEG_BYTES, 0, big, 0, JPEG_BYTES.length);
        필드_오류를_기대한다(mockMvc.perform(요청("제목", MP4_BYTES)
                .file(new MockMultipartFile("thumbnail", "t.jpg", "image/jpeg", big))), "thumbnail");
    }

    @Test
    void 재생_시간이_0_이하이거나_숫자가_아니면_400이다() throws Exception {
        for (String bad : new String[] {"0", "-1", "abc", "NaN"}) {
            필드_오류를_기대한다(mockMvc.perform(요청("제목", MP4_BYTES).param("durationSeconds", bad)),
                    "durationSeconds");
        }
    }

    @Test
    void 여러_필드가_틀리면_오류를_모두_담는다() throws Exception {
        mockMvc.perform(요청(" ", null).param("durationSeconds", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.length()").value(3));
    }

    @Test
    void 없는_방송은_ProblemDetail_404다() throws Exception {
        mockMvc.perform(get("/api/broadcasts/999999"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void 잘못된_Range는_ProblemDetail_416이고_Content_Range를_유지한다() throws Exception {
        String location = mockMvc.perform(요청("범위", MP4_BYTES)).andReturn().getResponse().getHeader("Location");
        mockMvc.perform(get(location + "/video").header("Range", "bytes=500-600"))
                .andExpect(status().isRequestedRangeNotSatisfiable())
                .andExpect(header().string("Content-Range", "bytes */" + MP4_BYTES.length))
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(416));
    }
}

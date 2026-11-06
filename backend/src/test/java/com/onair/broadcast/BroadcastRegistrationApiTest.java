package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.support.ApiTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

class BroadcastRegistrationApiTest extends ApiTestSupport {

    // 4~7번째 바이트가 ftyp인 작은 mp4 흉내 바이트
    static final byte[] MP4_BYTES = {
            0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8};

    // FF D8 FF로 시작하는 JPEG 흉내 바이트
    static final byte[] JPEG_BYTES = {
            (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 9, 8, 7, 6, 5};

    MockMultipartHttpServletRequestBuilder 등록_요청(String title) {
        return multipart("/api/broadcasts").with(owner().credentials())
                .file(new MockMultipartFile("video", "내 영상 파일.mp4", "video/mp4", MP4_BYTES))
                .param("title", title);
    }

    @Test
    void 등록하면_목록_맨_앞에_나타나고_상세를_조회할_수_있다() throws Exception {
        MvcResult created = mockMvc.perform(등록_요청("첫 번째 방송")
                        .file(new MockMultipartFile("thumbnail", "thumb.jpg", "image/jpeg", JPEG_BYTES))
                        .param("durationSeconds", "125.5"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", org.hamcrest.Matchers.matchesPattern(".*/api/broadcasts/\\d+")))
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.kind").value("RECORDING"))
                .andExpect(jsonPath("$.title").value("첫 번째 방송"))
                .andReturn();
        String location = created.getResponse().getHeader("Location");
        int id = com.jayway.jsonpath.JsonPath.read(created.getResponse().getContentAsString(), "$.id");

        mockMvc.perform(등록_요청("두 번째 방송"))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/broadcasts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].title").value("두 번째 방송"))
                .andExpect(jsonPath("$.items[1].title").value("첫 번째 방송"))
                .andExpect(jsonPath("$.items[1].id").value(id))
                .andExpect(jsonPath("$.items[1].kind").value("RECORDING"))
                .andExpect(jsonPath("$.items[1].durationSeconds").value(125.5))
                .andExpect(jsonPath("$.items[1].thumbnailUrl").value("/api/broadcasts/" + id + "/thumbnail"))
                .andExpect(jsonPath("$.items[1].createdAt").isString())
                .andExpect(jsonPath("$.hasNext").value(false));

        mockMvc.perform(get(location))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.kind").value("RECORDING"))
                .andExpect(jsonPath("$.title").value("첫 번째 방송"))
                .andExpect(jsonPath("$.createdAt").isString())
                .andExpect(jsonPath("$.video.url").value("/api/broadcasts/" + id + "/video"))
                .andExpect(jsonPath("$.video.contentType").value("video/mp4"))
                .andExpect(jsonPath("$.video.sizeBytes").value(MP4_BYTES.length))
                .andExpect(jsonPath("$.video.durationSeconds").value(125.5))
                .andExpect(jsonPath("$.video.thumbnailUrl").value("/api/broadcasts/" + id + "/thumbnail"));
    }

    @Test
    void 썸네일과_재생_시간이_없어도_등록된다() throws Exception {
        MvcResult created = mockMvc.perform(등록_요청("정보 없는 방송"))
                .andExpect(status().isCreated())
                .andReturn();
        String location = created.getResponse().getHeader("Location");

        mockMvc.perform(get(location))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("정보 없는 방송"))
                .andExpect(jsonPath("$.video.durationSeconds").doesNotExist())
                .andExpect(jsonPath("$.video.thumbnailUrl").doesNotExist());
    }

    @Test
    void 썸네일을_JPEG와_캐시_헤더로_돌려준다() throws Exception {
        MvcResult created = mockMvc.perform(등록_요청("썸네일 방송")
                        .file(new MockMultipartFile("thumbnail", "thumb.jpg", "image/jpeg", JPEG_BYTES)))
                .andExpect(status().isCreated())
                .andReturn();
        String location = created.getResponse().getHeader("Location");

        MvcResult thumbnail = mockMvc.perform(get(location + "/thumbnail"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/jpeg"))
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("max-age=")))
                .andReturn();
        assertThat(thumbnail.getResponse().getContentAsByteArray()).isEqualTo(JPEG_BYTES);
    }

    @Test
    void 썸네일이_없는_방송의_썸네일_조회는_404다() throws Exception {
        MvcResult created = mockMvc.perform(등록_요청("썸네일 없는 방송"))
                .andExpect(status().isCreated())
                .andReturn();

        mockMvc.perform(get(created.getResponse().getHeader("Location") + "/thumbnail"))
                .andExpect(status().isNotFound());
    }

    @Test
    void 없는_방송의_상세와_썸네일_조회는_404다() throws Exception {
        mockMvc.perform(get("/api/broadcasts/999999"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/broadcasts/999999/thumbnail"))
                .andExpect(status().isNotFound());
    }

    @Test
    void 영상은_UUID_이름으로_저장_폴더에_저장된다() throws Exception {
        mockMvc.perform(등록_요청("저장 확인"))
                .andExpect(status().isCreated());

        try (var files = java.nio.file.Files.list(storageDir)) {
            assertThat(files.map(p -> p.getFileName().toString()))
                    .isNotEmpty()
                    .allMatch(name -> name.matches("[0-9a-f-]{36}"));
        }
    }
}

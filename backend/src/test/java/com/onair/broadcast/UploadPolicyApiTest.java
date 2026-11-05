package com.onair.broadcast;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

/**
 * 업로드 정책 조회: GET /api/broadcasts/upload-policy. 화면이 서버의 크기 상한을 그대로 쓰게 한다.
 * 상한은 테스트 설정의 app.upload.max-size(200MB)를 그대로 쓴다. 따로 바꾸면 컨텍스트를 새로 띄워야 한다.
 */
class UploadPolicyApiTest extends ApiTestSupport {

    @Test
    void 영상과_썸네일_상한을_바이트로_돌려준다() throws Exception {
        mockMvc.perform(get("/api/broadcasts/upload-policy"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.maxVideoBytes").value(200L * 1024 * 1024))
                .andExpect(jsonPath("$.maxThumbnailBytes").value(2L * 1024 * 1024))
                .andExpect(jsonPath("$.maxTitleLength").value(100));
    }

    @Test
    void 방송_id_조회와_충돌하지_않는다() throws Exception {
        mockMvc.perform(get("/api/broadcasts/999999"))
                .andExpect(status().isNotFound());
    }
}

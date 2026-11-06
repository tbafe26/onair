package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.auth.Csrf;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;

/** kind 컬럼이 구분 컬럼으로 실제 기록되고, 재생 시간이 같은 컬럼에 double로 저장되는지 DB에서 직접 확인한다. */
class BroadcastKindColumnApiTest extends ApiTestSupport {

    static final byte[] MP4_BYTES = {0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0};

    @Test
    void 녹화방송을_등록하면_kind_컬럼에_RECORDING이_기록된다() throws Exception {
        mockMvc.perform(multipart("/api/broadcasts").with(Csrf.token())
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", MP4_BYTES))
                        .param("title", "구분 컬럼")
                        .param("durationSeconds", "12.5"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("RECORDING"));

        assertThat(jdbc.queryForObject("select kind from broadcast", String.class)).isEqualTo("RECORDING");
        assertThat(jdbc.queryForObject("select duration_seconds from video", Double.class)).isEqualTo(12.5);
    }
}

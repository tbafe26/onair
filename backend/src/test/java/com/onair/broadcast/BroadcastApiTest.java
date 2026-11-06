package com.onair.broadcast;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.support.ApiTestSupport;
import org.junit.jupiter.api.Test;

class BroadcastApiTest extends ApiTestSupport {

    @Test
    void 방송이_없으면_빈_목록을_돌려준다() throws Exception {
        mockMvc.perform(get("/api/broadcasts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.hasNext").value(false));
    }
}

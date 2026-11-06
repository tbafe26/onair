package com.onair.comment;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.onair.support.ApiTestSupport;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.json.JsonMapper;

/** 라이브방송 채팅 규칙을 REST로 확인한다: 방송 중에만 쓸 수 있고, 지울 수 없고, 종료 뒤에도 읽을 수 있다. */
class LiveChatApiTest extends ApiTestSupport {

    static final JsonMapper JSON = JsonMapper.builder().build();

    int 방송을_시작한다() throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts/live").with(owner().credentials()).param("title", "채팅 방송"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    String 쓴다(int id, String content) throws Exception {
        return mockMvc.perform(post("/api/broadcasts/{id}/comments", id).with(owner().credentials())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JSON.writeValueAsString(Map.of("content", content))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void 방송_중인_라이브방송에는_채팅을_쓰고_읽는다() throws Exception {
        int id = 방송을_시작한다();

        쓴다(id, "첫 채팅");

        mockMvc.perform(get("/api/broadcasts/{id}/comments", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].content").value("첫 채팅"))
                .andExpect(jsonPath("$.totalCount").value(1));
    }

    @Test
    void 종료된_라이브방송에_쓰면_409지만_그동안의_채팅은_읽을_수_있다() throws Exception {
        int id = 방송을_시작한다();
        쓴다(id, "끝나기 전");
        mockMvc.perform(post("/api/broadcasts/{id}/end", id).with(owner().credentials()))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/broadcasts/{id}/comments", id).with(owner().credentials())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JSON.writeValueAsString(Map.of("content", "끝난 뒤"))))
                .andExpect(status().isConflict());

        mockMvc.perform(get("/api/broadcasts/{id}/comments", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].content").value("끝나기 전"))
                .andExpect(jsonPath("$.totalCount").value(1));
    }

    @Test
    void 라이브방송의_채팅은_작성자도_지울_수_없어_409다() throws Exception {
        int id = 방송을_시작한다();
        int commentId = JsonPath.read(쓴다(id, "지울 수 없다"), "$.id");

        mockMvc.perform(delete("/api/broadcasts/{id}/comments/{commentId}", id, commentId).with(owner().credentials()))
                .andExpect(status().isConflict());

        mockMvc.perform(get("/api/broadcasts/{id}/comments", id))
                .andExpect(jsonPath("$.totalCount").value(1));
    }

    @Test
    void 종료된_뒤에도_채팅은_지울_수_없다() throws Exception {
        int id = 방송을_시작한다();
        int commentId = JsonPath.read(쓴다(id, "남는 채팅"), "$.id");
        mockMvc.perform(post("/api/broadcasts/{id}/end", id).with(owner().credentials()))
                .andExpect(status().isNoContent());

        mockMvc.perform(delete("/api/broadcasts/{id}/comments/{commentId}", id, commentId).with(owner().credentials()))
                .andExpect(status().isConflict());
    }
}

package com.onair.live;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.onair.support.ApiTestSupport;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

/** 미디어 서버(MediaMTX)가 송출을 받기 전에 묻는 송출 인증. 2xx면 허용, 그 밖에는 거절로 본다. */
class MediaAuthApiTest extends ApiTestSupport {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    record Started(int id, String streamKey) {
    }

    Started 시작한다() throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts/live").with(owner().credentials()).param("title", "송출 인증"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return new Started(JsonPath.read(body, "$.id"), JsonPath.read(body, "$.streamKey"));
    }

    // 미디어 서버가 보내는 모양 그대로. 서버끼리의 요청이라 세션과 CSRF 토큰이 없다.
    ResultActions 묻는다(String action, String path, String token) throws Exception {
        Map<String, Object> request = Map.of(
                "user", "", "password", "", "token", token, "ip", "<미디어 서버 주소>",
                "action", action, "path", path, "protocol", "webrtc", "query", "");
        return mockMvc.perform(post("/internal/media/auth")
                .contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(request)));
    }

    @Test
    void 방송_중인_라이브방송에_그_방송의_키로_송출하면_허용한다() throws Exception {
        Started live = 시작한다();

        묻는다("publish", "live/" + live.id(), live.streamKey()).andExpect(status().isOk());
    }

    @Test
    void 키가_틀리거나_없거나_다른_방송의_키면_거절한다() throws Exception {
        Started live = 시작한다();
        Started other = 시작한다();

        묻는다("publish", "live/" + live.id(), "wrong-key").andExpect(status().isUnauthorized());
        묻는다("publish", "live/" + live.id(), "").andExpect(status().isUnauthorized());
        묻는다("publish", "live/" + live.id(), other.streamKey()).andExpect(status().isUnauthorized());
    }

    @Test
    void 종료된_방송에는_맞는_키로도_송출할_수_없다() throws Exception {
        Started live = 시작한다();
        mockMvc.perform(post("/api/broadcasts/" + live.id() + "/end").with(owner().credentials()))
                .andExpect(status().isNoContent());

        묻는다("publish", "live/" + live.id(), live.streamKey()).andExpect(status().isUnauthorized());
    }

    @Test
    void 송출이_아닌_요청과_모르는_경로는_거절한다() throws Exception {
        Started live = 시작한다();

        묻는다("read", "live/" + live.id(), live.streamKey()).andExpect(status().isUnauthorized());
        묻는다("api", "", "").andExpect(status().isUnauthorized());
        묻는다("publish", String.valueOf(live.id()), live.streamKey()).andExpect(status().isUnauthorized());
        묻는다("publish", "live/abc", live.streamKey()).andExpect(status().isUnauthorized());
        묻는다("publish", "live/999999", live.streamKey()).andExpect(status().isUnauthorized());
    }
}

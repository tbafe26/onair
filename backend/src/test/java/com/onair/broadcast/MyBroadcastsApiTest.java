package com.onair.broadcast;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.onair.auth.AuthClient;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

/** 내 방송 목록: 로그인 필요, 내 방송만, 목록 API와 같은 커서·응답 모양. */
class MyBroadcastsApiTest extends ApiTestSupport {

    static final byte[] MP4_BYTES = {
            0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8};

    int 녹화방송을_올린다(AuthClient user, String title) throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts").with(user.credentials())
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", MP4_BYTES))
                        .param("title", title))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    int 라이브방송을_시작한다(AuthClient user, String title) throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts/live").with(user.credentials()).param("title", title))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    @Test
    void 비로그인은_401이다() throws Exception {
        mockMvc.perform(get("/api/me/broadcasts"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 내_방송만_녹화와_라이브_구분_없이_최신순으로_나온다() throws Exception {
        AuthClient other = AuthClient.signedUp(mockMvc, "other01", "남");
        녹화방송을_올린다(owner(), "내 녹화");
        녹화방송을_올린다(other, "남의 녹화");
        라이브방송을_시작한다(owner(), "내 라이브");
        라이브방송을_시작한다(other, "남의 라이브");

        mockMvc.perform(get("/api/me/broadcasts").with(owner().session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].title").value("내 라이브"))
                .andExpect(jsonPath("$.items[0].kind").value("LIVE"))
                .andExpect(jsonPath("$.items[0].owner.nickname").value("소유자닉"))
                .andExpect(jsonPath("$.items[1].title").value("내 녹화"))
                .andExpect(jsonPath("$.hasNext").value(false));
    }

    @Test
    void 커서와_크기는_목록_API와_같게_동작한다() throws Exception {
        int first = 녹화방송을_올린다(owner(), "하나");
        녹화방송을_올린다(owner(), "둘");
        녹화방송을_올린다(owner(), "셋");

        mockMvc.perform(get("/api/me/broadcasts").param("size", "2").with(owner().session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.hasNext").value(true));
        mockMvc.perform(get("/api/me/broadcasts").param("before", String.valueOf(first + 2)).param("size", "2")
                        .with(owner().session()))
                .andExpect(jsonPath("$.items[0].title").value("둘"))
                .andExpect(jsonPath("$.items[1].title").value("하나"))
                .andExpect(jsonPath("$.hasNext").value(false));
        mockMvc.perform(get("/api/me/broadcasts").param("size", "0").with(owner().session()))
                .andExpect(status().isBadRequest());
    }
}

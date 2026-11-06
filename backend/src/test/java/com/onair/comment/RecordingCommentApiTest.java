package com.onair.comment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.onair.auth.AuthClient;
import com.onair.auth.Csrf;
import com.onair.support.ApiTestSupport;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.json.JsonMapper;

/** 녹화방송 댓글: 공개 읽기, 로그인한 사용자의 쓰기, 작성자만의 삭제. 방송 소유자는 owner(), 다른 사용자는 가입해서 만든다. */
class RecordingCommentApiTest extends ApiTestSupport {

    static final byte[] MP4_BYTES = {
            0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8};
    static final JsonMapper JSON = JsonMapper.builder().build();

    RequestPostProcessor 비로그인() {
        return Csrf.token();
    }

    RequestPostProcessor 소유자() {
        return owner().credentials();
    }

    RequestPostProcessor 사용자(String loginId, String nickname) throws Exception {
        return AuthClient.signedUp(mockMvc, loginId, nickname).credentials();
    }

    int 녹화방송을_올린다(String title) throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts").with(owner().credentials())
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", MP4_BYTES))
                        .param("title", title))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    ResultActions 쓴다(RequestPostProcessor who, Object broadcastId, String content) throws Exception {
        return mockMvc.perform(post("/api/broadcasts/{id}/comments", broadcastId).with(who)
                .contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(java.util.Map.of("content", content))));
    }

    ResultActions 댓글을_지운다(RequestPostProcessor who, Object broadcastId, Object commentId) throws Exception {
        return mockMvc.perform(delete("/api/broadcasts/{id}/comments/{commentId}", broadcastId, commentId).with(who));
    }

    int 쓰고_id를_받는다(RequestPostProcessor who, int broadcastId, String content) throws Exception {
        String body = 쓴다(who, broadcastId, content).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    String 읽는다(Object broadcastId, String query) throws Exception {
        return mockMvc.perform(get("/api/broadcasts/{id}/comments" + query, broadcastId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    int 전체_개수(int broadcastId) throws Exception {
        return JsonPath.read(읽는다(broadcastId, ""), "$.totalCount");
    }

    @Test
    void 비로그인도_댓글을_읽을_수_있고_처음엔_비어_있다() throws Exception {
        int id = 녹화방송을_올린다("영상");

        mockMvc.perform(get("/api/broadcasts/{id}/comments", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.nextCursor").isEmpty())
                .andExpect(jsonPath("$.totalCount").value(0));
    }

    @Test
    void 비로그인은_댓글을_쓰면_401이다() throws Exception {
        int id = 녹화방송을_올린다("영상");

        쓴다(비로그인(), id, "안녕").andExpect(status().isUnauthorized());

        assertThat(전체_개수(id)).isZero();
    }

    @Test
    void 로그인한_사용자가_쓰면_201과_댓글을_돌려준다() throws Exception {
        int id = 녹화방송을_올린다("영상");

        쓴다(사용자("other01", "남"), id, "  안녕하세요\n두 줄  ")
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/broadcasts/" + id + "/comments"))
                .andExpect(jsonPath("$.content").value("안녕하세요\n두 줄"))
                .andExpect(jsonPath("$.author.nickname").value("남"))
                .andExpect(jsonPath("$.author.id").isNumber())
                .andExpect(jsonPath("$.createdAt").isString())
                .andExpect(jsonPath("$.id").isNumber());
    }

    @Test
    void 내용이_비었거나_300자를_넘으면_400이고_300자는_허용한다() throws Exception {
        int id = 녹화방송을_올린다("영상");

        쓴다(소유자(), id, "   \n ").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("content"));
        쓴다(소유자(), id, "가".repeat(301)).andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/broadcasts/{id}/comments", id).with(소유자())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        쓴다(소유자(), id, "가".repeat(300)).andExpect(status().isCreated());
        // 앞뒤 공백은 길이에 세지 않는다.
        쓴다(소유자(), id, " " + "나".repeat(300) + " ").andExpect(status().isCreated());
    }

    @Test
    void 없는_방송에_쓰거나_읽으면_404다() throws Exception {
        쓴다(소유자(), 999999, "안녕").andExpect(status().isNotFound());
        mockMvc.perform(get("/api/broadcasts/{id}/comments", 999999)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/broadcasts/abc/comments")).andExpect(status().isNotFound());
    }

    @Test
    void 최신순으로_돌려주고_커서와_전체_개수를_준다() throws Exception {
        int id = 녹화방송을_올린다("영상");
        int other = 녹화방송을_올린다("다른 영상");
        int first = 쓰고_id를_받는다(소유자(), id, "하나");
        int second = 쓰고_id를_받는다(소유자(), id, "둘");
        int third = 쓰고_id를_받는다(소유자(), id, "셋");
        쓰고_id를_받는다(소유자(), other, "딴 방송");

        String page1 = 읽는다(id, "?size=2");
        assertThat(JsonPath.<List<Integer>>read(page1, "$.items[*].id")).containsExactly(third, second);
        assertThat(JsonPath.<Integer>read(page1, "$.nextCursor")).isEqualTo(second);
        assertThat(JsonPath.<Integer>read(page1, "$.totalCount")).isEqualTo(3);

        String page2 = 읽는다(id, "?size=2&before=" + second);
        assertThat(JsonPath.<List<Integer>>read(page2, "$.items[*].id")).containsExactly(first);
        assertThat(JsonPath.<Object>read(page2, "$.nextCursor")).isNull();
        assertThat(JsonPath.<Integer>read(page2, "$.totalCount")).isEqualTo(3);
    }

    @Test
    void size는_기본_20이고_50으로_줄이며_1_미만은_400이다() throws Exception {
        int id = 녹화방송을_올린다("영상");
        for (int i = 0; i < 21; i++) {
            쓰고_id를_받는다(소유자(), id, "댓글 " + i);
        }

        assertThat(JsonPath.<List<?>>read(읽는다(id, ""), "$.items")).hasSize(20);
        assertThat(JsonPath.<List<?>>read(읽는다(id, "?size=500"), "$.items")).hasSize(21);
        mockMvc.perform(get("/api/broadcasts/{id}/comments?size=0", id)).andExpect(status().isBadRequest());
    }

    @Test
    void 댓글_삭제는_비로그인_401_작성자_성공_다른_사용자_403이다() throws Exception {
        int id = 녹화방송을_올린다("영상");
        RequestPostProcessor 작성자 = 사용자("other01", "남");
        RequestPostProcessor 제3자 = 사용자("third01", "셋째");
        int commentId = 쓰고_id를_받는다(작성자, id, "지울 글");

        댓글을_지운다(비로그인(), id, commentId).andExpect(status().isUnauthorized());
        댓글을_지운다(제3자, id, commentId).andExpect(status().isForbidden());
        assertThat(전체_개수(id)).isEqualTo(1);

        댓글을_지운다(작성자, id, commentId).andExpect(status().isNoContent());
        assertThat(전체_개수(id)).isZero();
    }

    @Test
    void 방송_소유자도_남의_댓글은_지울_수_없다() throws Exception {
        int id = 녹화방송을_올린다("영상");
        int commentId = 쓰고_id를_받는다(사용자("other01", "남"), id, "남의 글");

        댓글을_지운다(소유자(), id, commentId).andExpect(status().isForbidden());
    }

    @Test
    void 다른_방송의_댓글_id나_없는_댓글은_404다() throws Exception {
        int id = 녹화방송을_올린다("영상");
        int other = 녹화방송을_올린다("다른 영상");
        int commentId = 쓰고_id를_받는다(소유자(), other, "저쪽 글");

        댓글을_지운다(소유자(), id, commentId).andExpect(status().isNotFound());
        댓글을_지운다(소유자(), id, 999999).andExpect(status().isNotFound());
        assertThat(전체_개수(other)).isEqualTo(1);
    }

    @Test
    void 방송을_지우면_그_방송의_댓글도_지워지고_다른_방송의_댓글은_남는다() throws Exception {
        int id = 녹화방송을_올린다("영상");
        int other = 녹화방송을_올린다("다른 영상");
        RequestPostProcessor 작성자 = 사용자("other01", "남");
        쓰고_id를_받는다(작성자, id, "사라질 글");
        쓰고_id를_받는다(작성자, other, "남을 글");

        mockMvc.perform(delete("/api/broadcasts/{id}", id).with(소유자())).andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("select count(*) from broadcast_comment", Integer.class)).isEqualTo(1);
        assertThat(전체_개수(other)).isEqualTo(1);
    }
}

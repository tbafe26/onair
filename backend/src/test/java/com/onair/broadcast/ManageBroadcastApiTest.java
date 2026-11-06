package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.onair.auth.AuthClient;
import com.onair.auth.Csrf;
import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** 제목 수정과 삭제: 세 사용자(비로그인, 소유자, 다른 사용자)가 같은 요청을 보내 서버가 권한을 가른다. */
class ManageBroadcastApiTest extends ApiTestSupport {

    static final byte[] MP4_BYTES = {
            0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8};
    static final byte[] JPEG_BYTES = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 9, 8, 7, 6, 5};

    /** 요청을 보내는 사람. 비로그인은 세션도 토큰도 싣지 않는다. */
    record Actor(String name, RequestPostProcessor credentials) {
    }

    Actor 비로그인() {
        return new Actor("비로그인", Csrf.token());
    }

    Actor 소유자() {
        return new Actor("소유자", owner().credentials());
    }

    Actor 다른_사용자() throws Exception {
        return new Actor("다른 사용자", AuthClient.signedUp(mockMvc, "other01", "남").credentials());
    }

    int 녹화방송을_올린다(String title) throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts").with(owner().credentials())
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", MP4_BYTES))
                        .file(new MockMultipartFile("thumbnail", "t.jpg", "image/jpeg", JPEG_BYTES))
                        .param("title", title))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    int 라이브방송을_시작한다(String title) throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts/live").with(owner().credentials())
                        .file(new MockMultipartFile("thumbnail", "t.jpg", "image/jpeg", JPEG_BYTES))
                        .param("title", title))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    ResultActions 제목을_고친다(Actor actor, Object id, String title) throws Exception {
        return mockMvc.perform(patch("/api/broadcasts/{id}", id).with(actor.credentials())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"" + title + "\"}"));
    }

    ResultActions 지운다(Actor actor, Object id) throws Exception {
        return mockMvc.perform(delete("/api/broadcasts/{id}", id).with(actor.credentials()));
    }

    long 저장된_파일_수() throws IOException {
        try (var files = Files.list(storageDir)) {
            return files.count();
        }
    }

    @Test
    void 제목_수정은_소유자만_할_수_있다() throws Exception {
        int id = 녹화방송을_올린다("원래 제목");

        제목을_고친다(비로그인(), id, "바꾼 제목").andExpect(status().isUnauthorized());
        제목을_고친다(다른_사용자(), id, "바꾼 제목").andExpect(status().isForbidden());
        mockMvc.perform(get("/api/broadcasts/{id}", id)).andExpect(jsonPath("$.title").value("원래 제목"));

        제목을_고친다(소유자(), id, "  바꾼 제목  ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.title").value("바꾼 제목"))
                .andExpect(jsonPath("$.kind").value("RECORDING"))
                .andExpect(jsonPath("$.owner.nickname").value("방장"));
        mockMvc.perform(get("/api/broadcasts/{id}", id)).andExpect(jsonPath("$.title").value("바꾼 제목"));
    }

    @Test
    void 라이브방송의_제목도_고칠_수_있다() throws Exception {
        int id = 라이브방송을_시작한다("원래 라이브");

        제목을_고친다(소유자(), id, "바꾼 라이브")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("LIVE"))
                .andExpect(jsonPath("$.title").value("바꾼 라이브"));
    }

    @Test
    void 제목_수정은_없는_방송이면_404이고_로그인_확인이_먼저다() throws Exception {
        제목을_고친다(소유자(), 999999, "제목").andExpect(status().isNotFound());
        제목을_고친다(비로그인(), 999999, "제목").andExpect(status().isUnauthorized());
        제목을_고친다(소유자(), "abc", "제목").andExpect(status().isNotFound());
    }

    @Test
    void 제목_수정도_등록과_같은_규칙으로_검사한다() throws Exception {
        int id = 녹화방송을_올린다("원래 제목");

        제목을_고친다(소유자(), id, "   ")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("title"))
                .andExpect(jsonPath("$.errors[0].reason").value("제목을 입력하세요"));
        제목을_고친다(소유자(), id, "가".repeat(101))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("title"));
        mockMvc.perform(patch("/api/broadcasts/{id}", id).with(소유자().credentials())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("title"));
        mockMvc.perform(get("/api/broadcasts/{id}", id)).andExpect(jsonPath("$.title").value("원래 제목"));
    }

    @Test
    void 녹화방송_삭제는_소유자만_할_수_있고_영상_행과_파일이_지워진다() throws Exception {
        int id = 녹화방송을_올린다("지울 방송");
        assertThat(저장된_파일_수()).isEqualTo(2);

        지운다(비로그인(), id).andExpect(status().isUnauthorized());
        지운다(다른_사용자(), id).andExpect(status().isForbidden());
        assertThat(repository.count()).isEqualTo(1);
        assertThat(저장된_파일_수()).isEqualTo(2);

        지운다(소유자(), id).andExpect(status().isNoContent());

        assertThat(repository.count()).isZero();
        assertThat(jdbc.queryForObject("select count(*) from video", Long.class)).isZero();
        assertThat(저장된_파일_수()).isZero();
        mockMvc.perform(get("/api/broadcasts/{id}", id)).andExpect(status().isNotFound());
        지운다(소유자(), id).andExpect(status().isNotFound());
    }

    @Test
    void 방송_중인_라이브방송은_지울_수_없고_종료되면_썸네일과_함께_지워진다() throws Exception {
        int id = 라이브방송을_시작한다("라이브");

        지운다(비로그인(), id).andExpect(status().isUnauthorized());
        지운다(다른_사용자(), id).andExpect(status().isForbidden());
        지운다(소유자(), id).andExpect(status().isConflict());
        assertThat(repository.count()).isEqualTo(1);
        assertThat(저장된_파일_수()).isEqualTo(1);

        jdbc.update("update live_broadcast set status = 'ENDED' where id = ?", id);
        지운다(소유자(), id).andExpect(status().isNoContent());

        assertThat(repository.count()).isZero();
        assertThat(저장된_파일_수()).isZero();
    }

    @Test
    void 파일이_이미_없어도_삭제는_성공한다() throws Exception {
        int id = 녹화방송을_올린다("파일 없는 방송");
        try (var files = Files.list(storageDir)) {
            for (var file : files.toList()) {
                Files.delete(file);
            }
        }

        지운다(소유자(), id).andExpect(status().isNoContent());

        assertThat(repository.count()).isZero();
    }

    @Test
    void 다른_사람의_방송은_그대로_남는다() throws Exception {
        int mine = 녹화방송을_올린다("내 방송");
        Actor other = 다른_사용자();

        List<ResultActions> attempts = List.of(제목을_고친다(other, mine, "탈취"), 지운다(other, mine));
        for (ResultActions attempt : attempts) {
            attempt.andExpect(status().isForbidden());
        }
        mockMvc.perform(get("/api/broadcasts/{id}", mine))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("내 방송"));
    }
}

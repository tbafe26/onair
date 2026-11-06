package com.onair.donation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.onair.auth.AuthClient;
import com.onair.auth.Csrf;
import com.onair.support.ApiTestSupport;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.json.JsonMapper;

/** 후원 주문 만들기: 검사 순서(401, 404, 400, 409, 403)와 저장된 대기 후원을 REST로 확인한다. */
class DonationOrderApiTest extends ApiTestSupport {

    static final JsonMapper JSON = JsonMapper.builder().build();
    static final byte[] MP4_BYTES = {
            0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8};

    int 라이브방송을_시작한다() throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts/live").with(owner().credentials()).param("title", "후원 방송"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    int 녹화방송을_올린다() throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts").with(owner().credentials())
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", MP4_BYTES))
                        .param("title", "녹화"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    AuthClient 시청자() throws Exception {
        return AuthClient.signedUp(mockMvc, "viewer01", "시청자닉");
    }

    ResultActions 주문한다(RequestPostProcessor who, Object broadcastId, Object body) throws Exception {
        return mockMvc.perform(post("/api/broadcasts/{id}/donations", broadcastId).with(who)
                .contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(body)));
    }

    ResultActions 금액으로_주문한다(RequestPostProcessor who, Object broadcastId, long amount) throws Exception {
        return 주문한다(who, broadcastId, Map.of("amount", amount));
    }

    @Test
    void 비로그인은_401이고_본문이_깨져도_먼저_401이다() throws Exception {
        int id = 라이브방송을_시작한다();

        금액으로_주문한다(Csrf.token(), id, 5000).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/broadcasts/{id}/donations", id).with(Csrf.token())
                        .contentType(MediaType.APPLICATION_JSON).content("{깨진"))
                .andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("select count(*) from donation", Long.class)).isZero();
    }

    @Test
    void 없는_방송은_404다() throws Exception {
        금액으로_주문한다(시청자().credentials(), 99999, 5000).andExpect(status().isNotFound());
    }

    @Test
    void 금액_규칙을_어기면_400이고_칸별_오류를_준다() throws Exception {
        int id = 라이브방송을_시작한다();
        RequestPostProcessor viewer = 시청자().credentials();

        for (long amount : List.of(0L, 999L, 1500L, 500_001L, 501_000L, -1000L)) {
            금액으로_주문한다(viewer, id, amount).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors[0].field").value("amount"));
        }
        주문한다(viewer, id, Map.of("message", "금액 없음")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("amount"));
        금액으로_주문한다(viewer, id, 1000).andExpect(status().isCreated());
        금액으로_주문한다(viewer, id, 500_000).andExpect(status().isCreated());
    }

    @Test
    void 메시지는_100자까지고_넘으면_400이다() throws Exception {
        int id = 라이브방송을_시작한다();
        RequestPostProcessor viewer = 시청자().credentials();

        주문한다(viewer, id, Map.of("amount", 5000, "message", "가".repeat(101)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("message"));
        주문한다(viewer, id, Map.of("amount", 5000, "message", "가".repeat(100))).andExpect(status().isCreated());
    }

    @Test
    void 녹화방송에는_후원할_수_없어_409다() throws Exception {
        int id = 녹화방송을_올린다();

        금액으로_주문한다(시청자().credentials(), id, 5000).andExpect(status().isConflict());
    }

    @Test
    void 종료된_라이브방송에는_후원할_수_없어_409다() throws Exception {
        int id = 라이브방송을_시작한다();
        RequestPostProcessor viewer = 시청자().credentials();
        mockMvc.perform(post("/api/broadcasts/{id}/end", id).with(owner().credentials()))
                .andExpect(status().isNoContent());

        금액으로_주문한다(viewer, id, 5000).andExpect(status().isConflict());
    }

    @Test
    void 자기_방송에는_후원할_수_없어_403이다() throws Exception {
        int id = 라이브방송을_시작한다();

        금액으로_주문한다(owner().credentials(), id, 5000).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from donation", Long.class)).isZero();
    }

    @Test
    void 검사_순서는_400_409_403이다() throws Exception {
        int recording = 녹화방송을_올린다();

        금액으로_주문한다(시청자().credentials(), recording, 1).andExpect(status().isBadRequest());
        금액으로_주문한다(owner().credentials(), recording, 5000).andExpect(status().isConflict());
    }

    @Test
    void 성공하면_201과_주문_정보를_주고_대기_후원이_소유자에게_저장된다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();

        String body = 주문한다(viewer.credentials(), id, Map.of("amount", 5000, "message", " 힘내세요 "))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.amount").value(5000))
                .andExpect(jsonPath("$.orderName").value("온에어 방송 후원"))
                .andExpect(jsonPath("$.clientKey").value("test_gck_dummy"))
                .andReturn().getResponse().getContentAsString();

        String orderId = JsonPath.read(body, "$.orderId");
        assertThat(orderId).matches("[A-Za-z0-9_-]{6,64}");
        assertThat(body).doesNotContain("시청자닉").doesNotContain("힘내세요").doesNotContain("secret");
        Map<String, Object> row = jdbc.queryForMap(
                "select status, amount, message, donor_id, recipient_id, broadcast_id, payment_key, confirmed_at"
                        + " from donation where order_id = ?", orderId);
        assertThat(row.get("STATUS")).isEqualTo("PENDING");
        assertThat(((Number) row.get("AMOUNT")).longValue()).isEqualTo(5000);
        assertThat(row.get("MESSAGE")).isEqualTo("힘내세요");
        assertThat(((Number) row.get("DONOR_ID")).longValue()).isEqualTo(viewer.userId());
        assertThat(((Number) row.get("RECIPIENT_ID")).longValue()).isEqualTo(owner().userId());
        assertThat(((Number) row.get("BROADCAST_ID")).longValue()).isEqualTo(id);
        assertThat(row.get("PAYMENT_KEY")).isNull();
        assertThat(row.get("CONFIRMED_AT")).isNull();
    }

    @Test
    void 방송을_지우면_그_방송의_후원도_지워진다() throws Exception {
        int id = 라이브방송을_시작한다();
        금액으로_주문한다(시청자().credentials(), id, 5000).andExpect(status().isCreated());
        mockMvc.perform(post("/api/broadcasts/{id}/end", id).with(owner().credentials()))
                .andExpect(status().isNoContent());

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/broadcasts/{id}", id).with(owner().credentials()))
                .andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("select count(*) from donation", Long.class)).isZero();
    }

    @Test
    void 주문마다_주문_번호가_다르다() throws Exception {
        int id = 라이브방송을_시작한다();
        RequestPostProcessor viewer = 시청자().credentials();

        String first = 금액으로_주문한다(viewer, id, 1000).andReturn().getResponse().getContentAsString();
        String second = 금액으로_주문한다(viewer, id, 1000).andReturn().getResponse().getContentAsString();

        assertThat((String) JsonPath.read(first, "$.orderId")).isNotEqualTo(JsonPath.read(second, "$.orderId"));
    }
}

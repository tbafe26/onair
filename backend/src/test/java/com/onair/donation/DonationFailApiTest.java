package com.onair.donation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.auth.AuthClient;
import com.onair.auth.Csrf;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** 결제창의 실패·취소 기록 API: 대기일 때만 상태를 바꾸고, 확정된 주문은 그대로 둔다. */
class DonationFailApiTest extends DonationApiTestSupport {

    ResultActions 실패를_기록한다(RequestPostProcessor who, String orderId, Object body) throws Exception {
        return mockMvc.perform(post("/api/donations/{orderId}/fail", orderId).with(who)
                .contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(body)));
    }

    @Test
    void 사용자가_결제창을_닫으면_CANCELED로_기록하고_코드를_남긴다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");

        실패를_기록한다(viewer.credentials(), orderId, Map.of("code", "PAY_PROCESS_CANCELED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELED"));

        Map<String, Object> row = 후원_행(orderId);
        assertThat(row.get("STATUS")).isEqualTo("CANCELED");
        assertThat(row.get("FAILURE_CODE")).isEqualTo("PAY_PROCESS_CANCELED");
    }

    @Test
    void 그_밖의_코드는_FAILED로_기록한다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");

        실패를_기록한다(viewer.credentials(), orderId, Map.of("code", "REJECT_CARD_COMPANY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FAILED"));

        Map<String, Object> row = 후원_행(orderId);
        assertThat(row.get("STATUS")).isEqualTo("FAILED");
        assertThat(row.get("FAILURE_CODE")).isEqualTo("REJECT_CARD_COMPANY");
    }

    @Test
    void 이미_확정된_주문은_그대로_두고_현재_상태를_돌려준다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());

        실패를_기록한다(viewer.credentials(), orderId, Map.of("code", "PAY_PROCESS_CANCELED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"));

        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("CONFIRMED");
    }

    @Test
    void 이미_실패한_주문의_첫_코드를_유지한다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        실패를_기록한다(viewer.credentials(), orderId, Map.of("code", "REJECT_CARD_COMPANY")).andExpect(status().isOk());

        실패를_기록한다(viewer.credentials(), orderId, Map.of("code", "PAY_PROCESS_CANCELED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FAILED"));

        assertThat(후원_행(orderId).get("FAILURE_CODE")).isEqualTo("REJECT_CARD_COMPANY");
    }

    @Test
    void 비로그인은_401이다() throws Exception {
        실패를_기록한다(Csrf.token(), "order", Map.of("code", "X")).andExpect(status().isUnauthorized());
    }

    @Test
    void 없는_주문은_404다() throws Exception {
        실패를_기록한다(시청자().credentials(), "없는주문", Map.of("code", "X")).andExpect(status().isNotFound());
    }

    @Test
    void 후원자가_아닌_사용자는_403이고_후원은_대기로_남는다() throws Exception {
        int id = 라이브방송을_시작한다();
        String orderId = 주문을_만든다(시청자().credentials(), id, 5000, "응원");
        RequestPostProcessor other = AuthClient.signedUp(mockMvc, "other01", "다른닉").credentials();

        실패를_기록한다(other, orderId, Map.of("code", "PAY_PROCESS_CANCELED")).andExpect(status().isForbidden());

        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("PENDING");
    }

    @Test
    void 코드가_없으면_400이고_후원은_대기로_남는다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");

        실패를_기록한다(viewer.credentials(), orderId, Map.of()).andExpect(status().isBadRequest());

        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("PENDING");
    }
}

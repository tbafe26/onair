package com.onair.donation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.onair.auth.AuthClient;
import com.onair.support.ApiTestSupport;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.json.JsonMapper;

/** 후원 REST 테스트의 공통 도우미: 방송 만들기, 사용자 가입, 주문과 승인 요청. */
abstract class DonationApiTestSupport extends ApiTestSupport {

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

    /** 주문을 만들고 주문 번호를 돌려준다. */
    String 주문을_만든다(RequestPostProcessor who, int broadcastId, long amount, String message) throws Exception {
        String body = 주문한다(who, broadcastId, Map.of("amount", amount, "message", message))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.orderId");
    }

    ResultActions 승인한다(RequestPostProcessor who, String paymentKey, String orderId, long amount) throws Exception {
        return mockMvc.perform(post("/api/donations/confirm").with(who)
                .contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(Map.of("paymentKey", paymentKey, "orderId", orderId, "amount", amount))));
    }

    Map<String, Object> 후원_행(String orderId) {
        return jdbc.queryForMap("select status, payment_key, failure_code, confirmed_at, amount from donation"
                + " where order_id = ?", orderId);
    }
}

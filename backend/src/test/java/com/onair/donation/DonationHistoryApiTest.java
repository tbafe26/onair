package com.onair.donation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.onair.auth.AuthClient;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

/** 방송별 후원 내역과 합계: 확정만, 최신순 커서, 공개 조회, 방송 삭제를 REST로 확인한다. */
class DonationHistoryApiTest extends DonationApiTestSupport {

    int keySeq = 0;

    void 후원을_확정한다(AuthClient donor, int broadcastId, long amount, String message) throws Exception {
        String orderId = 주문을_만든다(donor.credentials(), broadcastId, amount, message);
        승인한다(donor.credentials(), "pk_" + (++keySeq), orderId, amount).andExpect(status().isOk());
    }

    ResultActions 내역을_본다(Object broadcastId, String query) throws Exception {
        return mockMvc.perform(get("/api/broadcasts/{id}/donations" + query, broadcastId));
    }

    @Test
    void 확정된_후원만_합계와_함께_로그인_없이_보인다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        후원을_확정한다(viewer, id, 5000, "힘내세요");
        주문을_만든다(viewer.credentials(), id, 7000, "대기");
        String failed = 주문을_만든다(viewer.credentials(), id, 9000, "실패");
        승인한다(viewer.credentials(), "pk_bad", failed, 1000).andExpect(status().isBadRequest());

        내역을_본다(id, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total.amount").value(5000))
                .andExpect(jsonPath("$.total.count").value(1))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").isNumber())
                .andExpect(jsonPath("$.items[0].amount").value(5000))
                .andExpect(jsonPath("$.items[0].message").value("힘내세요"))
                .andExpect(jsonPath("$.items[0].donor.id").value(viewer.userId()))
                .andExpect(jsonPath("$.items[0].donor.nickname").value("시청자닉"))
                .andExpect(jsonPath("$.items[0].confirmedAt").isNotEmpty())
                .andExpect(jsonPath("$.items[0].orderId").doesNotExist())
                .andExpect(jsonPath("$.items[0].paymentKey").doesNotExist())
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    void 후원이_없으면_합계_0과_빈_목록이다() throws Exception {
        int id = 라이브방송을_시작한다();

        내역을_본다(id, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total.amount").value(0))
                .andExpect(jsonPath("$.total.count").value(0))
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void 확정_시각이_늦은_순으로_나오고_커서로_이어_읽는다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        // 주문은 a, b, c 순으로 만들고 확정은 c, a, b 순으로 한다. 같은 시각의 후원은 id가 큰 쪽이 먼저다.
        String a = 주문을_만든다(viewer.credentials(), id, 1000, "a");
        String b = 주문을_만든다(viewer.credentials(), id, 2000, "b");
        String c = 주문을_만든다(viewer.credentials(), id, 3000, "c");
        clock.advance(Duration.ofSeconds(1));
        승인한다(viewer.credentials(), "pk_c", c, 3000).andExpect(status().isOk());
        clock.advance(Duration.ofSeconds(1));
        승인한다(viewer.credentials(), "pk_a", a, 1000).andExpect(status().isOk());
        승인한다(viewer.credentials(), "pk_b", b, 2000).andExpect(status().isOk());

        String first = 내역을_본다(id, "?size=2")
                .andExpect(jsonPath("$.items[0].message").value("b"))
                .andExpect(jsonPath("$.items[1].message").value("a"))
                .andExpect(jsonPath("$.total.count").value(3))
                .andExpect(jsonPath("$.nextCursor").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        String cursor = JsonPath.read(first, "$.nextCursor");

        내역을_본다(id, "?size=2&cursor=" + cursor)
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].message").value("c"))
                .andExpect(jsonPath("$.total.amount").value(6000))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    void 다른_방송의_후원은_섞이지_않는다() throws Exception {
        int first = 라이브방송을_시작한다();
        int second = 라이브방송을_시작한다();
        후원을_확정한다(시청자(), second, 5000, "다른 방송");

        내역을_본다(first, "")
                .andExpect(jsonPath("$.total.count").value(0))
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void 방송이_없으면_404다() throws Exception {
        내역을_본다(999999, "").andExpect(status().isNotFound());
    }

    @Test
    void 잘못된_커서와_크기는_400이다() throws Exception {
        int id = 라이브방송을_시작한다();

        내역을_본다(id, "?cursor=abc").andExpect(status().isBadRequest());
        내역을_본다(id, "?size=0").andExpect(status().isBadRequest());
    }

    @Test
    void 녹화방송에는_후원이_없어_빈_내역이다() throws Exception {
        int id = 녹화방송을_올린다();

        내역을_본다(id, "").andExpect(status().isOk()).andExpect(jsonPath("$.total.count").value(0));
    }

    @Test
    void 방송을_지우면_확정된_후원도_지워진다() throws Exception {
        int id = 라이브방송을_시작한다();
        후원을_확정한다(시청자(), id, 5000, "응원");
        mockMvc.perform(post("/api/broadcasts/{id}/end", id).with(owner().credentials()))
                .andExpect(status().isNoContent());

        mockMvc.perform(delete("/api/broadcasts/{id}", id).with(owner().credentials()))
                .andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("select count(*) from donation", Long.class)).isZero();
        내역을_본다(id, "").andExpect(status().isNotFound());
    }
}

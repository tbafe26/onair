package com.onair.donation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.auth.AuthClient;
import com.onair.auth.Csrf;
import com.onair.support.FakePaymentGateway.ConfirmCall;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** 결제 승인과 후원 확정: 대조, 한 번만 확정, 거절·불일치 기록, 권한을 REST와 가짜 결제 서비스로 확인한다. */
class DonationConfirmApiTest extends DonationApiTestSupport {

    final ExecutorService executor = Executors.newCachedThreadPool();

    @AfterEach
    void 스레드를_정리한다() {
        executor.shutdownNow();
    }

    @Test
    void 승인하면_결제_서비스에_세_값만_보내고_후원이_확정된다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "힘내세요");

        승인한다(viewer.credentials(), "pk_1", orderId, 5000)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.amount").value(5000))
                .andExpect(jsonPath("$.message").value("힘내세요"))
                .andExpect(jsonPath("$.donor.id").value(viewer.userId()))
                .andExpect(jsonPath("$.donor.nickname").value("시청자닉"))
                .andExpect(jsonPath("$.confirmedAt").isNotEmpty())
                .andExpect(jsonPath("$.paymentKey").doesNotExist());

        assertThat(payments.confirmCalls()).containsExactly(new ConfirmCall("pk_1", orderId, 5000));
        Map<String, Object> row = 후원_행(orderId);
        assertThat(row.get("STATUS")).isEqualTo("CONFIRMED");
        assertThat(row.get("PAYMENT_KEY")).isEqualTo("pk_1");
        assertThat(row.get("CONFIRMED_AT")).isNotNull();
    }

    @Test
    void 같은_승인을_반복하면_결제_서비스를_다시_부르지_않고_같은_결과를_돌려준다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        String first = 승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String second = 승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(second).isEqualTo(first);
        assertThat(payments.confirmCalls()).hasSize(1);
        assertThat(jdbc.queryForObject("select count(*) from donation where status = 'CONFIRMED'", Long.class))
                .isEqualTo(1);
    }

    @Test
    void 확정된_주문을_다른_결제_키로_승인하면_409다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());

        승인한다(viewer.credentials(), "pk_other", orderId, 5000).andExpect(status().isConflict());

        assertThat(후원_행(orderId).get("PAYMENT_KEY")).isEqualTo("pk_1");
    }

    @Test
    void 확정된_주문을_같은_결제_키에_다른_금액으로_승인하면_400이고_상태는_그대로다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());

        승인한다(viewer.credentials(), "pk_1", orderId, 1000).andExpect(status().isBadRequest());

        Map<String, Object> row = 후원_행(orderId);
        assertThat(row.get("STATUS")).isEqualTo("CONFIRMED");
        assertThat(row.get("FAILURE_CODE")).isNull();
        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());
    }

    @Test
    void 결제가_확인된_주문은_그사이_취소_기록이_먼저_들어와도_확정한다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        payments.onConfirm(call -> {
            jdbc.update("update donation set status = 'CANCELED', failure_code = 'PAY_PROCESS_CANCELED'"
                    + " where order_id = ?", orderId);
            return new PaymentResult.Paid("DONE", call.orderId(), call.amount(), call.paymentKey());
        });

        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());

        Map<String, Object> row = 후원_행(orderId);
        assertThat(row.get("STATUS")).isEqualTo("CONFIRMED");
        assertThat(row.get("PAYMENT_KEY")).isEqualTo("pk_1");
        assertThat(row.get("FAILURE_CODE")).isNull();
    }

    @Test
    void 결제_서비스가_거절했어도_그사이_다른_요청이_확정했으면_확정_결과를_돌려준다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        payments.onConfirm(call -> {
            jdbc.update("update donation set status = 'CONFIRMED', payment_key = ?, confirmed_at = current_timestamp"
                    + " where order_id = ?", call.paymentKey(), orderId);
            return new PaymentResult.Rejected("ALREADY_PROCESSED_PAYMENT_X", "거절");
        });

        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());

        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("CONFIRMED");
    }

    @Test
    void 비로그인은_401이고_본문이_깨져도_먼저_401이다() throws Exception {
        승인한다(Csrf.token(), "pk_1", "order", 5000).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/donations/confirm").with(Csrf.token())
                        .contentType(MediaType.APPLICATION_JSON).content("{깨진"))
                .andExpect(status().isUnauthorized());
        assertThat(payments.confirmCalls()).isEmpty();
    }

    @Test
    void 없는_주문은_404다() throws Exception {
        승인한다(시청자().credentials(), "pk_1", "없는주문", 5000).andExpect(status().isNotFound());
        assertThat(payments.confirmCalls()).isEmpty();
    }

    @Test
    void 후원자가_아닌_사용자는_소유자도_403이고_후원은_대기로_남는다() throws Exception {
        int id = 라이브방송을_시작한다();
        String orderId = 주문을_만든다(시청자().credentials(), id, 5000, "응원");
        RequestPostProcessor other = AuthClient.signedUp(mockMvc, "other01", "다른닉").credentials();

        승인한다(other, "pk_1", orderId, 5000).andExpect(status().isForbidden());
        승인한다(owner().credentials(), "pk_1", orderId, 5000).andExpect(status().isForbidden());

        assertThat(payments.confirmCalls()).isEmpty();
        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("PENDING");
    }

    @Test
    void 금액이_저장된_값과_다르면_결제_서비스를_부르지_않고_FAILED_400이다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");

        승인한다(viewer.credentials(), "pk_1", orderId, 1000).andExpect(status().isBadRequest());

        assertThat(payments.confirmCalls()).isEmpty();
        Map<String, Object> row = 후원_행(orderId);
        assertThat(row.get("STATUS")).isEqualTo("FAILED");
        assertThat(row.get("FAILURE_CODE")).isEqualTo("AMOUNT_MISMATCH");
        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isConflict());
    }

    @Test
    void 결제_서비스가_거절하면_토스_코드로_FAILED_402이고_다시_승인할_수_없다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        payments.onConfirm(call -> new PaymentResult.Rejected("REJECT_CARD_PAYMENT", "한도 초과"));

        승인한다(viewer.credentials(), "pk_1", orderId, 5000)
                .andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("REJECT_CARD_PAYMENT")));

        Map<String, Object> row = 후원_행(orderId);
        assertThat(row.get("STATUS")).isEqualTo("FAILED");
        assertThat(row.get("FAILURE_CODE")).isEqualTo("REJECT_CARD_PAYMENT");
        assertThat(row.get("PAYMENT_KEY")).isNull();
        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isConflict());
        assertThat(payments.confirmCalls()).hasSize(1);
    }

    @Test
    void 결제_서비스_응답의_상태_주문_금액이_하나라도_다르면_FAILED_402다() throws Exception {
        AuthClient viewer = 시청자();
        int id = 라이브방송을_시작한다();
        List<java.util.function.Function<ConfirmCall, PaymentResult>> wrongResponses = List.of(
                call -> new PaymentResult.Paid("CANCELED", call.orderId(), call.amount(), call.paymentKey()),
                call -> new PaymentResult.Paid("DONE", "다른주문", call.amount(), call.paymentKey()),
                call -> new PaymentResult.Paid("DONE", call.orderId(), 1000, call.paymentKey()));

        for (var wrong : wrongResponses) {
            String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
            payments.onConfirm(wrong);

            승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isPaymentRequired());

            assertThat(후원_행(orderId).get("STATUS")).isEqualTo("FAILED");
        }
    }

    @Test
    void 이미_처리됨이면_결제를_다시_조회해_맞으면_확정한다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        payments.onConfirm(call -> new PaymentResult.AlreadyProcessed());
        payments.onFind(paymentKey -> new PaymentResult.Paid("DONE", orderId, 5000, paymentKey));

        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());

        assertThat(payments.findCalls()).containsExactly("pk_1");
        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("CONFIRMED");
    }

    @Test
    void 이미_처리됨인데_조회한_결제가_다르면_FAILED_402다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        payments.onConfirm(call -> new PaymentResult.AlreadyProcessed());
        payments.onFind(paymentKey -> new PaymentResult.Paid("DONE", "다른주문", 5000, paymentKey));

        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isPaymentRequired());

        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("FAILED");
    }

    @Test
    void 결제_서비스에_닿지_못하면_502이고_후원은_대기로_남아_다시_승인할_수_있다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        payments.onConfirm(call -> {
            throw new PaymentGatewayUnavailableException("연결 실패");
        });

        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isBadGateway());
        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("PENDING");

        payments.onConfirm(call -> new PaymentResult.Paid(
                "DONE", call.orderId(), call.amount(), call.paymentKey()));
        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());
    }

    @Test
    void 결제를_시작한_뒤_방송이_끝나도_확정한다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        mockMvc.perform(post("/api/broadcasts/{id}/end", id).with(owner().credentials()))
                .andExpect(status().isNoContent());

        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());

        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("CONFIRMED");
    }

    @Test
    void 같은_승인_두_개를_동시에_보내도_한_건만_확정되고_둘_다_같은_결과를_받는다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        CountDownLatch bothInGateway = new CountDownLatch(2);
        // 두 요청이 모두 대기 상태를 읽고 결제 서비스까지 들어온 뒤에 풀어, 확정이 겹치는 순간을 만든다.
        payments.onConfirm(call -> {
            bothInGateway.countDown();
            try {
                bothInGateway.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return new PaymentResult.Paid("DONE", call.orderId(), call.amount(), call.paymentKey());
        });

        List<Future<String>> results = List.of(
                executor.submit(() -> 승인한다(viewer.credentials(), "pk_1", orderId, 5000)
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()),
                executor.submit(() -> 승인한다(viewer.credentials(), "pk_1", orderId, 5000)
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()));

        assertThat(results.get(0).get(10, TimeUnit.SECONDS)).isEqualTo(results.get(1).get(10, TimeUnit.SECONDS));
        assertThat(jdbc.queryForObject("select count(*) from donation where status = 'CONFIRMED'", Long.class))
                .isEqualTo(1);
    }
}

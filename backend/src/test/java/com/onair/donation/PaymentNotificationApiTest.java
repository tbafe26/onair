package com.onair.donation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.auth.AuthClient;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/** 승인 통지: 로그인·CSRF 없이 받고, 본문 대신 결제 서비스 조회로 판단하며, 몇 번 와도 한 번만 확정한다. */
class PaymentNotificationApiTest extends DonationApiTestSupport {

    final ExecutorService executor = Executors.newCachedThreadPool();

    @AfterEach
    void 스레드를_정리한다() {
        executor.shutdownNow();
    }

    ResultActions 통지한다(String body) throws Exception {
        return mockMvc.perform(post("/api/payments/toss/notifications")
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    ResultActions 통지한다(String paymentKey, String orderId) throws Exception {
        return 통지한다("{\"eventType\":\"PAYMENT_STATUS_CHANGED\",\"createdAt\":\"2026-01-01T00:00:00+09:00\","
                + "\"data\":{\"paymentKey\":\"" + paymentKey + "\",\"orderId\":\"" + orderId
                + "\",\"status\":\"DONE\",\"totalAmount\":1}}");
    }

    String 대기_주문() throws Exception {
        return 주문을_만든다(시청자().credentials(), 라이브방송을_시작한다(), 5000, "응원");
    }

    long 확정_건수() {
        return jdbc.queryForObject("select count(*) from donation where status = 'CONFIRMED'", Long.class);
    }

    @Test
    void 로그인과_CSRF_없이_보낸_통지로_조회_결과가_맞으면_확정된다() throws Exception {
        String orderId = 대기_주문();
        payments.onFind(key -> new PaymentResult.Paid("DONE", orderId, 5000, key));

        통지한다("pk_1", orderId).andExpect(status().isOk());

        assertThat(payments.findCalls()).containsExactly("pk_1");
        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("CONFIRMED");
        assertThat(후원_행(orderId).get("PAYMENT_KEY")).isEqualTo("pk_1");
    }

    @Test
    void 같은_통지가_여러_번_와도_한_건만_확정된다() throws Exception {
        String orderId = 대기_주문();
        payments.onFind(key -> new PaymentResult.Paid("DONE", orderId, 5000, key));

        for (int i = 0; i < 3; i++) {
            통지한다("pk_1", orderId).andExpect(status().isOk());
        }

        assertThat(확정_건수()).isEqualTo(1);
    }

    @Test
    void 본문의_금액을_바꿔도_조회_결과로_판단한다() throws Exception {
        String orderId = 대기_주문();
        payments.onFind(key -> new PaymentResult.Paid("DONE", orderId, 1000, key));

        통지한다("{\"data\":{\"paymentKey\":\"pk_1\",\"orderId\":\"" + orderId
                + "\",\"status\":\"DONE\",\"totalAmount\":5000}}").andExpect(status().isOk());

        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("PENDING");
    }

    @Test
    void 조회_결과가_DONE이_아니면_확정하지_않는다() throws Exception {
        String orderId = 대기_주문();
        payments.onFind(key -> new PaymentResult.Paid("IN_PROGRESS", orderId, 5000, key));

        통지한다("pk_1", orderId).andExpect(status().isOk());

        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("PENDING");
    }

    @Test
    void 조회_결과의_주문_번호가_다르면_확정하지_않는다() throws Exception {
        String orderId = 대기_주문();
        payments.onFind(key -> new PaymentResult.Paid("DONE", "다른주문", 5000, key));

        통지한다("pk_1", orderId).andExpect(status().isOk());

        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("PENDING");
    }

    @Test
    void 결제_서비스가_거절하거나_장애여도_200이고_확정하지_않는다() throws Exception {
        String orderId = 대기_주문();

        통지한다("pk_1", orderId).andExpect(status().isOk());
        payments.onFind(key -> {
            throw new PaymentGatewayUnavailableException("down");
        });
        통지한다("pk_1", orderId).andExpect(status().isOk());

        assertThat(후원_행(orderId).get("STATUS")).isEqualTo("PENDING");
    }

    @Test
    void 모르는_주문과_깨진_본문도_200이고_결제_서비스를_부르지_않는다() throws Exception {
        통지한다("pk_1", "없는주문").andExpect(status().isOk());
        통지한다("not json").andExpect(status().isOk());
        통지한다("{\"data\":{}}").andExpect(status().isOk());
        통지한다("[]").andExpect(status().isOk());

        assertThat(payments.findCalls()).isEmpty();
    }

    @Test
    void 이미_끝난_주문은_무시한다() throws Exception {
        String orderId = 대기_주문();
        payments.onFind(key -> new PaymentResult.Paid("DONE", orderId, 5000, key));
        통지한다("pk_1", orderId).andExpect(status().isOk());
        payments.reset();
        payments.onFind(key -> new PaymentResult.Paid("DONE", orderId, 5000, key));

        통지한다("pk_other", orderId).andExpect(status().isOk());

        assertThat(payments.findCalls()).isEmpty();
        assertThat(후원_행(orderId).get("PAYMENT_KEY")).isEqualTo("pk_1");
    }

    @Test
    void 취소_또는_실패로_기록된_주문도_조회_결과가_결제_완료면_확정한다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        for (String status : List.of("CANCELED", "FAILED")) {
            String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
            jdbc.update("update donation set status = ?, failure_code = 'X' where order_id = ?", status, orderId);
            payments.onFind(key -> new PaymentResult.Paid("DONE", orderId, 5000, key));

            통지한다("pk_" + status, orderId).andExpect(status().isOk());

            assertThat(후원_행(orderId).get("STATUS")).isEqualTo("CONFIRMED");
            assertThat(후원_행(orderId).get("FAILURE_CODE")).isNull();
        }
    }

    @Test
    void 승인_요청과_통지가_섞여_와도_한_건만_확정된다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        CountDownLatch bothIn = new CountDownLatch(2);
        payments.onConfirm(call -> {
            bothIn.countDown();
            await(bothIn);
            return new PaymentResult.Paid("DONE", call.orderId(), call.amount(), call.paymentKey());
        });
        payments.onFind(key -> {
            bothIn.countDown();
            await(bothIn);
            return new PaymentResult.Paid("DONE", orderId, 5000, key);
        });

        List<Future<?>> results = List.of(
                executor.submit(() -> 승인한다(viewer.credentials(), "pk_1", orderId, 5000)
                        .andExpect(status().isOk())),
                executor.submit(() -> 통지한다("pk_1", orderId).andExpect(status().isOk())));
        for (Future<?> result : results) {
            result.get(10, TimeUnit.SECONDS);
        }

        assertThat(확정_건수()).isEqualTo(1);
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

package com.onair.donation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** 토스 adapter: 가짜 HTTP 서버로 요청 모양(주소, 인증, 본문, 멱등 키)과 응답·오류 해석을 확인한다. 실제 토스는 부르지 않는다. */
class TossPaymentGatewayTest {

    static final String BASE = "https://toss.test";
    static final String BASIC = "Basic " + Base64.getEncoder()
            .encodeToString("test_gsk_dummy:".getBytes(StandardCharsets.UTF_8));

    MockRestServiceServer server;

    TossPaymentGateway gateway(String secretKey, String testCode) {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE);
        server = MockRestServiceServer.bindTo(builder).build();
        TossSettings settings = new TossSettings("test_gck_dummy", secretKey, testCode, BASE);
        return new TossPaymentGateway(builder.build(), settings);
    }

    static final String DONE = """
            {"paymentKey":"pk_1","orderId":"order1","status":"DONE","totalAmount":5000,"method":"퀵계좌이체"}""";

    @Test
    void 승인은_주소와_Basic_인증_본문_멱등_키를_맞춰_보내고_결제를_돌려준다() {
        TossPaymentGateway gateway = gateway("test_gsk_dummy", "");
        server.expect(requestTo(BASE + "/v1/payments/confirm"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", BASIC))
                .andExpect(header("Idempotency-Key", "order1"))
                .andExpect(headerDoesNotExist("TossPayments-Test-Code"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.paymentKey").value("pk_1"))
                .andExpect(jsonPath("$.orderId").value("order1"))
                .andExpect(jsonPath("$.amount").value(5000))
                .andRespond(withSuccess(DONE, MediaType.APPLICATION_JSON));

        PaymentResult result = gateway.confirm("pk_1", "order1", 5000);

        assertThat(result).isEqualTo(new PaymentResult.Paid("DONE", "order1", 5000, "pk_1"));
        server.verify();
    }

    @Test
    void 조회는_결제_키로_GET을_보내고_결제를_돌려준다() {
        TossPaymentGateway gateway = gateway("test_gsk_dummy", "");
        server.expect(requestTo(BASE + "/v1/payments/pk_1"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", BASIC))
                .andRespond(withSuccess(DONE, MediaType.APPLICATION_JSON));

        assertThat(gateway.find("pk_1")).isEqualTo(new PaymentResult.Paid("DONE", "order1", 5000, "pk_1"));
        server.verify();
    }

    @Test
    void 거절은_토스의_오류_코드와_메시지를_담은_Rejected다() {
        TossPaymentGateway gateway = gateway("test_gsk_dummy", "");
        server.expect(requestTo(BASE + "/v1/payments/confirm"))
                .andRespond(withBadRequest().contentType(MediaType.APPLICATION_JSON)
                        .body("{\"code\":\"REJECT_CARD_PAYMENT\",\"message\":\"한도 초과\"}"));

        assertThat(gateway.confirm("pk_1", "order1", 5000))
                .isEqualTo(new PaymentResult.Rejected("REJECT_CARD_PAYMENT", "한도 초과"));
    }

    @Test
    void 이미_처리된_결제는_AlreadyProcessed다() {
        TossPaymentGateway gateway = gateway("test_gsk_dummy", "");
        server.expect(requestTo(BASE + "/v1/payments/confirm"))
                .andRespond(withBadRequest().contentType(MediaType.APPLICATION_JSON)
                        .body("{\"code\":\"ALREADY_PROCESSED_PAYMENT\",\"message\":\"이미 처리된 결제 입니다.\"}"));

        assertThat(gateway.confirm("pk_1", "order1", 5000)).isEqualTo(new PaymentResult.AlreadyProcessed());
    }

    @Test
    void 조회에서_없는_결제는_Rejected다() {
        TossPaymentGateway gateway = gateway("test_gsk_dummy", "");
        server.expect(requestTo(BASE + "/v1/payments/pk_x"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"code\":\"NOT_FOUND_PAYMENT\",\"message\":\"존재하지 않는 결제 입니다.\"}"));

        assertThat(gateway.find("pk_x")).isEqualTo(new PaymentResult.Rejected("NOT_FOUND_PAYMENT", "존재하지 않는 결제 입니다."));
    }

    @Test
    void 서버_오류나_해석할_수_없는_응답은_결제_서비스_오류_예외다() {
        TossPaymentGateway gateway = gateway("test_gsk_dummy", "");
        server.expect(requestTo(BASE + "/v1/payments/confirm")).andRespond(withServerError());
        server.expect(requestTo(BASE + "/v1/payments/confirm"))
                .andRespond(withBadRequest().contentType(MediaType.TEXT_PLAIN).body("not json"));

        assertThatThrownBy(() -> gateway.confirm("pk_1", "order1", 5000))
                .isInstanceOf(PaymentGatewayUnavailableException.class);
        assertThatThrownBy(() -> gateway.confirm("pk_1", "order1", 5000))
                .isInstanceOf(PaymentGatewayUnavailableException.class);
    }

    @Test
    void 테스트_코드_헤더는_테스트_시크릿_키일_때만_승인_요청에_붙는다() {
        TossPaymentGateway test = gateway("test_gsk_dummy", "REJECT_CARD_PAYMENT");
        server.expect(requestTo(BASE + "/v1/payments/confirm"))
                .andExpect(header("TossPayments-Test-Code", "REJECT_CARD_PAYMENT"))
                .andRespond(withSuccess(DONE, MediaType.APPLICATION_JSON));
        test.confirm("pk_1", "order1", 5000);
        server.verify();

        TossPaymentGateway live = gateway("live_gsk_dummy", "REJECT_CARD_PAYMENT");
        server.expect(requestTo(BASE + "/v1/payments/confirm"))
                .andExpect(headerDoesNotExist("TossPayments-Test-Code"))
                .andRespond(withSuccess(DONE, MediaType.APPLICATION_JSON));
        live.confirm("pk_1", "order1", 5000);
        server.verify();
    }

    @Test
    void 조회_요청에는_테스트_코드_헤더를_붙이지_않는다() {
        TossPaymentGateway gateway = gateway("test_gsk_dummy", "REJECT_CARD_PAYMENT");
        server.expect(requestTo(BASE + "/v1/payments/pk_1"))
                .andExpect(headerDoesNotExist("TossPayments-Test-Code"))
                .andRespond(withSuccess(DONE, MediaType.APPLICATION_JSON));

        gateway.find("pk_1");
        server.verify();
    }

    @Test
    void 승인_본문에는_결제_키_주문_번호_금액만_들어간다() {
        TossPaymentGateway gateway = gateway("test_gsk_dummy", "");
        server.expect(requestTo(BASE + "/v1/payments/confirm"))
                .andExpect(jsonPath("$.length()").value(3))
                .andRespond(withSuccess(DONE, MediaType.APPLICATION_JSON));

        gateway.confirm("pk_1", "order1", 5000);
        server.verify();
    }
}

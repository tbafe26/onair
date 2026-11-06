package com.onair.donation;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** 토스페이먼츠 결제 서비스 adapter. 승인(POST /v1/payments/confirm)과 조회(GET /v1/payments/{paymentKey})를 부른다. */
class TossPaymentGateway implements PaymentGateway {

    static final String ALREADY_PROCESSED = "ALREADY_PROCESSED_PAYMENT";

    private final RestClient client;
    private final String authorization;
    private final String testCode;

    TossPaymentGateway(RestClient client, TossSettings settings) {
        this.client = client;
        this.authorization = "Basic " + Base64.getEncoder()
                .encodeToString((settings.secretKey() + ":").getBytes(StandardCharsets.UTF_8));
        this.testCode = settings.effectiveTestCode();
    }

    @Override
    public PaymentResult confirm(String paymentKey, String orderId, long amount) {
        try {
            return client.post()
                    .uri("/v1/payments/confirm")
                    .header("Authorization", authorization)
                    .header("Idempotency-Key", orderId)
                    .headers(headers -> {
                        if (!testCode.isEmpty()) {
                            headers.set("TossPayments-Test-Code", testCode);
                        }
                    })
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new ConfirmBody(paymentKey, orderId, amount))
                    .exchange((request, response) -> read(response.getStatusCode(), response));
        } catch (RestClientException e) {
            throw new PaymentGatewayUnavailableException("결제 서비스에 연결하지 못했습니다");
        }
    }

    @Override
    public PaymentResult find(String paymentKey) {
        try {
            return client.get()
                    .uri("/v1/payments/{paymentKey}", paymentKey)
                    .header("Authorization", authorization)
                    .exchange((request, response) -> read(response.getStatusCode(), response));
        } catch (RestClientException e) {
            throw new PaymentGatewayUnavailableException("결제 서비스에 연결하지 못했습니다");
        }
    }

    // 2xx는 결제, 4xx는 {code, message} 거절이다. 그 밖의 응답이나 해석하지 못한 본문은 서비스 오류다.
    private static PaymentResult read(HttpStatusCode status, RestClient.RequestHeadersSpec.ConvertibleClientHttpResponse response) {
        try {
            if (status.is2xxSuccessful()) {
                Payment payment = response.bodyTo(Payment.class);
                if (payment == null || payment.paymentKey() == null || payment.orderId() == null) {
                    throw new PaymentGatewayUnavailableException("결제 서비스 응답을 해석하지 못했습니다");
                }
                return new PaymentResult.Paid(payment.status(), payment.orderId(), payment.totalAmount(),
                        payment.paymentKey());
            }
            if (status.is4xxClientError()) {
                Failure failure = response.bodyTo(Failure.class);
                if (failure == null || failure.code() == null) {
                    throw new PaymentGatewayUnavailableException("결제 서비스 응답을 해석하지 못했습니다");
                }
                if (ALREADY_PROCESSED.equals(failure.code())) {
                    return new PaymentResult.AlreadyProcessed();
                }
                return new PaymentResult.Rejected(failure.code(), failure.message());
            }
            throw new PaymentGatewayUnavailableException("결제 서비스가 오류로 답했습니다: " + status.value());
        } catch (RestClientException e) {
            throw new PaymentGatewayUnavailableException("결제 서비스 응답을 해석하지 못했습니다");
        }
    }

    private record ConfirmBody(String paymentKey, String orderId, long amount) {
    }

    private record Payment(String paymentKey, String orderId, String status, long totalAmount) {
    }

    private record Failure(String code, String message) {
    }
}

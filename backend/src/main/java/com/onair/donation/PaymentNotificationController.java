package com.onair.donation;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 토스 웹훅(PAYMENT_STATUS_CHANGED) 수신 adapter. 로그인과 CSRF 검사에서 빠지는 주소라서 본문은 믿지 않고
 * paymentKey와 orderId만 읽는다. 재전송을 막으려고 처리 결과와 상관없이 200을 돌려준다.
 */
@RestController
@RequestMapping("/api/payments/toss")
class PaymentNotificationController {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final Donations donations;

    PaymentNotificationController(Donations donations) {
        this.donations = donations;
    }

    @PostMapping("/notifications")
    ResponseEntity<Void> receive(@RequestBody(required = false) String body) {
        try {
            JsonNode data = JSON.readTree(body == null ? "" : body).path("data");
            String paymentKey = data.path("paymentKey").asString(null);
            String orderId = data.path("orderId").asString(null);
            if (paymentKey != null && !paymentKey.isBlank() && orderId != null && !orderId.isBlank()) {
                donations.handlePaymentNotification(paymentKey, orderId);
            }
        } catch (RuntimeException e) {
            // 어떤 오류여도 200이다. 결제 서비스가 재전송하거나 사용자가 승인하면 확정된다.
        }
        return ResponseEntity.ok().build();
    }
}

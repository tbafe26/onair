package com.onair.donation;

import com.onair.api.FieldViolation;
import com.onair.api.InvalidRequestException;
import com.onair.auth.AuthenticatedUser;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 결제 승인 요청을 후원 모듈에 넘기는 adapter. 후원자 확인과 대조는 모듈이 한다. */
@RestController
@RequestMapping("/api/donations")
class DonationConfirmController {

    private final Donations donations;

    DonationConfirmController(Donations donations) {
        this.donations = donations;
    }

    @PostMapping("/confirm")
    DonationView confirm(@RequestBody(required = false) ConfirmRequest request,
            @AuthenticationPrincipal AuthenticatedUser user) {
        ConfirmRequest body = request == null ? new ConfirmRequest(null, null, null) : request;
        List<FieldViolation> violations = body.violations();
        if (!violations.isEmpty()) {
            throw new InvalidRequestException(violations);
        }
        return donations.confirm(AuthenticatedUser.idOf(user), body.paymentKey(), body.orderId(), body.amount());
    }

    record ConfirmRequest(String paymentKey, String orderId, Long amount) {

        List<FieldViolation> violations() {
            List<FieldViolation> violations = new java.util.ArrayList<>();
            if (paymentKey == null || paymentKey.isBlank()) {
                violations.add(new FieldViolation("paymentKey", "결제 키가 필요합니다"));
            }
            if (orderId == null || orderId.isBlank()) {
                violations.add(new FieldViolation("orderId", "주문 번호가 필요합니다"));
            }
            if (amount == null) {
                violations.add(new FieldViolation("amount", "금액이 필요합니다"));
            }
            return violations;
        }
    }
}

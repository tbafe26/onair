package com.onair.donation;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 결제 서비스가 거절했거나 응답이 주문과 맞지 않는다. 402로 이어진다. */
class PaymentRejectedException extends ApiException {

    private static final long serialVersionUID = 1L;

    PaymentRejectedException(String code) {
        super(HttpStatus.PAYMENT_REQUIRED, "결제 거절", "결제를 승인하지 못했습니다: " + code);
    }
}

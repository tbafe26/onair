package com.onair.donation;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 결제 키가 설정되지 않았다. 503으로 이어진다. */
class PaymentNotConfiguredException extends ApiException {

    private static final long serialVersionUID = 1L;

    PaymentNotConfiguredException() {
        super(HttpStatus.SERVICE_UNAVAILABLE, "결제 설정 없음", "결제 키가 설정되지 않아 후원할 수 없습니다");
    }
}

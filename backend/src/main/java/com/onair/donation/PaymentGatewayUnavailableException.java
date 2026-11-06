package com.onair.donation;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 결제 서비스에 닿지 못했거나 서비스가 오류로 답했다. 후원은 대기로 남아 다시 승인할 수 있다. 502로 이어진다. */
public class PaymentGatewayUnavailableException extends ApiException {

    private static final long serialVersionUID = 1L;

    public PaymentGatewayUnavailableException(String message) {
        super(HttpStatus.BAD_GATEWAY, "결제 서비스 오류", message);
    }
}

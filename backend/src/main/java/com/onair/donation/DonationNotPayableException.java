package com.onair.donation;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 실패·취소된 주문이거나 다른 결제 키로 이미 확정된 주문이다. 409로 이어진다. */
class DonationNotPayableException extends ApiException {

    private static final long serialVersionUID = 1L;

    DonationNotPayableException() {
        super(HttpStatus.CONFLICT, "후원 처리 불가", "이미 실패했거나 취소된 후원이거나 다른 결제로 확정된 후원입니다");
    }
}

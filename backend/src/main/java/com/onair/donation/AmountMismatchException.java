package com.onair.donation;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 승인 요청의 금액이 저장된 금액과 다르다. 400으로 이어진다. */
class AmountMismatchException extends ApiException {

    private static final long serialVersionUID = 1L;

    AmountMismatchException() {
        super(HttpStatus.BAD_REQUEST, "금액 불일치", "요청한 금액이 주문 금액과 다릅니다");
    }
}

package com.onair.donation;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 주문 번호의 후원이 없다. 404로 이어진다. */
class DonationNotFoundException extends ApiException {

    private static final long serialVersionUID = 1L;

    DonationNotFoundException() {
        super(HttpStatus.NOT_FOUND, "후원 없음", "후원 주문을 찾을 수 없습니다");
    }
}

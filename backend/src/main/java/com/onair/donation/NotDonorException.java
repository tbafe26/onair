package com.onair.donation;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 후원자가 아닌 사용자가 주문을 처리하려 했다. 403으로 이어진다. */
class NotDonorException extends ApiException {

    private static final long serialVersionUID = 1L;

    NotDonorException() {
        super(HttpStatus.FORBIDDEN, "권한 없음", "본인의 후원 주문만 처리할 수 있습니다");
    }
}

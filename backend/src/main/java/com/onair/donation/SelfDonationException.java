package com.onair.donation;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 소유자가 자기 방송에 후원하려 했다. 403으로 이어진다. */
class SelfDonationException extends ApiException {

    private static final long serialVersionUID = 1L;

    SelfDonationException(long broadcastId) {
        super(HttpStatus.FORBIDDEN, "후원 불가", "자기 방송에는 후원할 수 없습니다: " + broadcastId);
    }
}

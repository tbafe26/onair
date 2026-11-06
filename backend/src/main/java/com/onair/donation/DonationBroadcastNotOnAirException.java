package com.onair.donation;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 녹화방송이거나 방송 중이 아닌 방송에 후원하려 했다. 409로 이어진다. */
class DonationBroadcastNotOnAirException extends ApiException {

    private static final long serialVersionUID = 1L;

    DonationBroadcastNotOnAirException(long broadcastId) {
        super(HttpStatus.CONFLICT, "후원 불가", "방송 중인 라이브방송에만 후원할 수 있습니다: " + broadcastId);
    }
}

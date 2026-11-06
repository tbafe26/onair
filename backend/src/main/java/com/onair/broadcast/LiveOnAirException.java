package com.onair.broadcast;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 방송 중인 라이브방송을 지우려 했다. 409로 이어진다. */
public class LiveOnAirException extends ApiException {

    private static final long serialVersionUID = 1L;

    public LiveOnAirException(long broadcastId) {
        super(HttpStatus.CONFLICT, "방송 중", "방송 중인 라이브방송은 지울 수 없습니다. 방송을 종료한 뒤 다시 시도하세요: " + broadcastId);
    }
}

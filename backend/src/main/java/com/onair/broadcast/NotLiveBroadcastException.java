package com.onair.broadcast;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 라이브방송이 아닌 방송(녹화방송)을 종료하려 했다. 409로 이어진다. */
public class NotLiveBroadcastException extends ApiException {

    private static final long serialVersionUID = 1L;

    public NotLiveBroadcastException(long broadcastId) {
        super(HttpStatus.CONFLICT, "라이브방송 아님", "라이브방송만 종료할 수 있습니다: " + broadcastId);
    }
}

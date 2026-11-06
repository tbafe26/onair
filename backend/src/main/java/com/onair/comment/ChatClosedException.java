package com.onair.comment;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 종료된 라이브방송에 채팅을 쓰려 했다. 409로 이어진다. */
public class ChatClosedException extends ApiException {

    private static final long serialVersionUID = 1L;

    public ChatClosedException(long broadcastId) {
        super(HttpStatus.CONFLICT, "채팅 종료", "종료된 라이브방송에는 채팅을 쓸 수 없습니다: " + broadcastId);
    }
}

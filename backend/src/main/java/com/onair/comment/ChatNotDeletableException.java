package com.onair.comment;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 라이브방송의 채팅을 지우려 했다. 채팅은 지울 수 없다. 409로 이어진다. */
public class ChatNotDeletableException extends ApiException {

    private static final long serialVersionUID = 1L;

    public ChatNotDeletableException(long commentId) {
        super(HttpStatus.CONFLICT, "채팅 삭제 불가", "라이브방송의 채팅은 지울 수 없습니다: " + commentId);
    }
}

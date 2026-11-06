package com.onair.broadcast;

/** 라이브방송의 채팅을 지우려 했다. 채팅은 지울 수 없다. 409로 이어진다. */
public class ChatNotDeletableException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ChatNotDeletableException(long commentId) {
        super("라이브방송의 채팅은 지울 수 없습니다: " + commentId);
    }
}

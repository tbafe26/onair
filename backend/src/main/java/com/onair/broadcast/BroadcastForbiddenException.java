package com.onair.broadcast;

/** 로그인했지만 방송의 소유자가 아닌 사용자가 소유자만 할 수 있는 일을 하려 했다. 403으로 이어진다. */
public class BroadcastForbiddenException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public BroadcastForbiddenException(long broadcastId) {
        super("방송의 소유자만 할 수 있습니다: " + broadcastId);
    }
}

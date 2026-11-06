package com.onair.broadcast;

/** 라이브방송이 아닌 방송(녹화방송)을 종료하려 했다. 409로 이어진다. */
public class NotLiveBroadcastException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public NotLiveBroadcastException(long broadcastId) {
        super("라이브방송만 종료할 수 있습니다: " + broadcastId);
    }
}

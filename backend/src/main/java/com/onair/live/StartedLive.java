package com.onair.live;

/** 시작된 라이브방송. 송출 키 원문은 이 값으로 한 번만 나간다. */
public record StartedLive(long broadcastId, String streamKey) {

    @Override
    public String toString() {
        return "StartedLive[broadcastId=" + broadcastId + "]";
    }
}

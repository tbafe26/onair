package com.onair.live;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 테스트용 미디어 서버. 송출 중인 방송을 직접 정하고, 끊으라는 요청을 기록한다. */
class FakeMediaServer implements MediaServer {

    final Set<Long> publishing = new HashSet<>();
    final List<Long> disconnected = new ArrayList<>();
    boolean unavailable;

    @Override
    public Set<Long> publishingBroadcasts() {
        if (unavailable) {
            throw new MediaServerUnavailableException("가짜 미디어 서버가 응답하지 않음", null);
        }
        return Set.copyOf(publishing);
    }

    @Override
    public void disconnect(long broadcastId) {
        if (unavailable) {
            throw new MediaServerUnavailableException("가짜 미디어 서버가 응답하지 않음", null);
        }
        disconnected.add(broadcastId);
    }
}

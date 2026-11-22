package com.onair.live;

import java.util.Set;

/** 라이브 송출을 받는 미디어 서버. 응답이 없거나 해석할 수 없으면 {@link MediaServerUnavailableException}을 던진다. */
interface MediaServer {

    /** 지금 송출을 받고 있는 라이브방송의 id. */
    Set<Long> publishingBroadcasts();

    /** 그 방송의 송출 연결을 끊는다. 송출이 없으면 아무 일도 하지 않는다. */
    void disconnect(long broadcastId);
}

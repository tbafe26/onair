package com.onair.live;

/**
 * 시그널링 상대. 송출 모듈이 메시지를 보내고 연결을 닫는 접점이다.
 * 실제 구현은 WebSocket 세션을 감싸고, 테스트 구현은 받은 메시지를 기록한다.
 */
public interface Peer {

    void send(SignalMessage message);

    void close();
}

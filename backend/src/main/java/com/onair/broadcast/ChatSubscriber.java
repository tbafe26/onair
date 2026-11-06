package com.onair.broadcast;

/** 채팅 구독자. 댓글 모듈이 메시지를 보내고 연결을 닫는 접점이다. 테스트 구현은 받은 메시지를 기록한다. */
interface ChatSubscriber {

    void send(ChatMessage message);

    void close();
}

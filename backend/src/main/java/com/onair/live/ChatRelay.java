package com.onair.live;

/**
 * 채팅 메시지를 모든 서버(보낸 서버 포함)의 {@link LiveChat}에 전하는 통로. 보내기와 받기만 드러내므로
 * PostgreSQL 대신 Redis 같은 다른 통로로 바꿀 때는 구현만 바꾼다.
 *
 * <p>저장하는 트랜잭션 안에서 보내면 커밋될 때만 전달된다. 되돌린 채팅은 어느 서버에도 가지 않는다.
 */
public interface ChatRelay {

    interface Receiver {

        void receive(long broadcastId, ChatMessage message);

        /** 메시지를 놓쳤을 수 있다. 구독자가 다시 접속해 빠진 채팅을 읽게 해야 한다. */
        void missedMessages();
    }

    void send(long broadcastId, ChatMessage message);

    void onReceive(Receiver receiver);
}

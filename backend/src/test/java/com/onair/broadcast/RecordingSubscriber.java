package com.onair.broadcast;

import java.util.ArrayList;
import java.util.List;

/** 테스트용 채팅 구독자: 받은 메시지를 기록하고 닫혔는지 기억한다. */
class RecordingSubscriber implements ChatSubscriber {

    final List<ChatMessage> received = new ArrayList<>();
    boolean closed;

    @Override
    public void send(ChatMessage message) {
        received.add(message);
    }

    @Override
    public void close() {
        closed = true;
    }

    List<String> types() {
        return received.stream().map(ChatMessage::type).toList();
    }

    ChatMessage last() {
        return received.getLast();
    }
}

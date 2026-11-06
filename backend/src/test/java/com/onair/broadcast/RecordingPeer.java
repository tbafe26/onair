package com.onair.broadcast;

import java.util.ArrayList;
import java.util.List;

/** 테스트용 Peer: 받은 메시지를 기록하고 닫혔는지 기억한다. */
class RecordingPeer implements Peer {

    final List<SignalMessage> received = new ArrayList<>();
    boolean closed;

    @Override
    public void send(SignalMessage message) {
        received.add(message);
    }

    @Override
    public void close() {
        closed = true;
    }

    List<String> types() {
        return received.stream().map(SignalMessage::type).toList();
    }

    SignalMessage last() {
        return received.getLast();
    }
}

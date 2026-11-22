package com.onair.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/** 서버가 보낸 WebSocket 메시지와 닫힘을 받아 두는 클라이언트 쪽 핸들러. */
class Inbox extends TextWebSocketHandler {

    // 개발 서버(Vite) 주소를 흉내 낸 Origin. 프록시를 거치면 Host는 백엔드 포트지만 Origin은 이 값이다.
    static final String DEV_SERVER_ORIGIN = "https://dev-pc.example:5173";

    final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
    final BlockingQueue<CloseStatus> closed = new LinkedBlockingQueue<>();

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        messages.add(message.getPayload());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        closed.add(status);
    }

    String next() throws InterruptedException {
        String message = messages.poll(10, TimeUnit.SECONDS);
        assertThat(message).as("서버가 보낸 메시지").isNotNull();
        return message;
    }
}

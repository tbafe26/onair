package com.onair.broadcast;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.json.JsonMapper;

/**
 * 채팅 WebSocket adapter: 연결을 채팅 구독으로 바꾸는 일만 한다. 서버 → 화면 한 방향이다.
 * 채팅 쓰기는 REST로만 하므로 화면이 보낸 메시지는 받아들이지 않고 연결을 닫는다.
 */
@Component
class ChatWebSocketHandler extends TextWebSocketHandler {

    private static final String SUBSCRIBER_ATTRIBUTE = "subscriber";

    private final Comments comments;
    private final JsonMapper json = JsonMapper.builder().build();

    ChatWebSocketHandler(Comments comments) {
        this.comments = comments;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        ChatSubscriber subscriber = new WebSocketPeer(session, json);
        session.getAttributes().put(SUBSCRIBER_ATTRIBUTE, subscriber);
        Long id = broadcastId(session);
        if (id == null) {
            subscriber.close();
            return;
        }
        comments.subscribe(id, subscriber);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        session.close(CloseStatus.POLICY_VIOLATION);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        if (session.getAttributes().get(SUBSCRIBER_ATTRIBUTE) instanceof ChatSubscriber subscriber) {
            comments.unsubscribe(subscriber);
        }
    }

    /** /api/broadcasts/{id}/chat에서 id를 읽는다. 숫자가 아니면 null이다. */
    private static Long broadcastId(WebSocketSession session) {
        if (session.getUri() == null) {
            return null;
        }
        String[] segments = session.getUri().getPath().split("/");
        try {
            return Long.valueOf(segments[segments.length - 2]);
        } catch (NumberFormatException | ArrayIndexOutOfBoundsException e) {
            return null;
        }
    }
}

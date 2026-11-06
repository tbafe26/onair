package com.onair.broadcast;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.json.JsonMapper;

/**
 * WebSocket 세션을 감싼 연결. 시그널링(Peer)과 채팅(ChatSubscriber)이 같이 쓴다.
 * 한 세션에 여러 스레드가 동시에 보내지 않도록 전송을 세션 단위로 직렬화한다.
 */
final class WebSocketPeer implements Peer, ChatSubscriber {

    private final WebSocketSession session;
    private final JsonMapper json;

    WebSocketPeer(WebSocketSession session, JsonMapper json) {
        this.session = session;
        this.json = json;
    }

    @Override
    public void send(SignalMessage message) {
        write(message.type(), message.fields());
    }

    @Override
    public void send(ChatMessage message) {
        write(message.type(), message.fields());
    }

    private void write(String type, Map<String, Object> fields) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", type);
        body.putAll(fields);
        String payload = json.writeValueAsString(body);
        synchronized (session) {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(payload));
                }
            } catch (IOException e) {
                // 이미 끊긴 연결이다. 연결 정리는 afterConnectionClosed가 맡는다.
            }
        }
    }

    @Override
    public void close() {
        synchronized (session) {
            try {
                session.close(CloseStatus.NORMAL);
            } catch (IOException e) {
                // 이미 닫혔다.
            }
        }
    }
}

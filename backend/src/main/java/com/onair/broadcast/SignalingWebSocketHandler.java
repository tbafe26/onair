package com.onair.broadcast;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * 시그널링 WebSocket adapter: JSON 메시지를 송출 모듈 호출로 바꾸는 일만 한다.
 * 송출 키는 메시지 본문으로만 오므로 주소와 로그에 남지 않는다. 메시지 내용은 로그에 쓰지 않는다.
 */
@Component
class SignalingWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(SignalingWebSocketHandler.class);
    private static final String PEER_ATTRIBUTE = "peer";
    private static final String BROADCAST_ID_ATTRIBUTE = "broadcastId";
    static final String USER_ID_ATTRIBUTE = "userId";
    private static final TypeReference<Map<String, Object>> JSON_OBJECT = new TypeReference<>() { };

    private final LiveBroadcasting live;
    private final JsonMapper json = JsonMapper.builder().build();

    SignalingWebSocketHandler(LiveBroadcasting live) {
        this.live = live;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        session.getAttributes().put(PEER_ATTRIBUTE, new WebSocketPeer(session, json));
        session.getAttributes().put(BROADCAST_ID_ATTRIBUTE, broadcastId(session));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage text) throws IOException {
        Map<String, Object> fields;
        try {
            fields = new LinkedHashMap<>(json.readValue(text.getPayload(), JSON_OBJECT));
        } catch (JacksonException e) {
            session.close(CloseStatus.BAD_DATA);
            return;
        }
        if (!(fields.remove("type") instanceof String type)) {
            session.close(CloseStatus.BAD_DATA);
            return;
        }
        // null 값은 필드가 없는 것으로 본다(SignalMessage는 null 값을 담지 않는다).
        fields.values().removeIf(value -> value == null);
        SignalMessage message = new SignalMessage(type, fields);

        Peer peer = (Peer) session.getAttributes().get(PEER_ATTRIBUTE);
        if (SignalMessage.JOIN_BROADCASTER.equals(type)) {
            Long id = (Long) session.getAttributes().get(BROADCAST_ID_ATTRIBUTE);
            if (id == null) {
                live.joinAsBroadcaster(-1, null, null, peer);
            } else {
                live.joinAsBroadcaster(id, message.text(SignalMessage.Field.STREAM_KEY), userId(session), peer);
            }
        } else if (SignalMessage.JOIN_VIEWER.equals(type)) {
            Long id = (Long) session.getAttributes().get(BROADCAST_ID_ATTRIBUTE);
            live.joinAsViewer(id == null ? -1 : id, peer);
        } else {
            live.relay(peer, message);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        if (session.getAttributes().get(PEER_ATTRIBUTE) instanceof Peer peer) {
            live.leave(peer);
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.debug("시그널링 전송 오류: {}", exception.getClass().getSimpleName());
    }

    /** 핸드셰이크 때 복사해 둔 로그인 사용자 id. 로그인하지 않았으면 null이다. */
    private static Long userId(WebSocketSession session) {
        return (Long) session.getAttributes().get(USER_ID_ATTRIBUTE);
    }

    /** /api/broadcasts/{id}/signal에서 id를 읽는다. 숫자가 아니면 null이다. */
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

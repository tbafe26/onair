package com.onair.broadcast;

import java.util.Map;

/**
 * 시그널링 메시지. type으로 종류를 구분하고, 나머지 필드는 fields에 담는다.
 * JSON과 바꾸는 일은 WebSocket adapter가 한다.
 */
public record SignalMessage(String type, Map<String, Object> fields) {

    public static final String JOIN_BROADCASTER = "join-broadcaster";
    public static final String JOINED = "joined";
    public static final String REJECTED = "rejected";
    public static final String END = "end";
    public static final String ENDED = "ended";

    public SignalMessage {
        fields = Map.copyOf(fields);
    }

    public static SignalMessage of(String type) {
        return new SignalMessage(type, Map.of());
    }

    public static SignalMessage of(String type, String field, Object value) {
        return new SignalMessage(type, Map.of(field, value));
    }

    /** 문자열 필드. 없거나 문자열이 아니면 null이다. */
    public String text(String field) {
        return fields.get(field) instanceof String value ? value : null;
    }

    // 송출 키가 로그에 남지 않도록 필드 값은 찍지 않는다.
    @Override
    public String toString() {
        return "SignalMessage[type=" + type + "]";
    }
}

package com.onair.live;

import java.util.Map;

/**
 * 채팅 WebSocket 메시지(서버 → 화면). 종류와 필드는 계약 파일 contracts/chat.json과 같아야 하고,
 * ChatContractTest가 대조한다. 시그널링 메시지(SignalMessage)와는 종류를 공유하지 않는다.
 */
public record ChatMessage(String type, Map<String, Object> fields) {

    static final String COMMENT = "comment";
    static final String DONATION = "donation";
    static final String ENDED = "ended";

    public ChatMessage {
        fields = Map.copyOf(fields);
    }

    public static ChatMessage comment(Object comment) {
        return new ChatMessage(COMMENT, Map.of("comment", comment));
    }

    public static ChatMessage donation(Object donation) {
        return new ChatMessage(DONATION, Map.of("donation", donation));
    }

    public static ChatMessage ended() {
        return new ChatMessage(ENDED, Map.of());
    }
}

package com.onair.broadcast;

/** 송출자·시청자 연결 결과. 거절이면 사유가 있다. */
public record JoinResult(Rejection rejection) {

    /** 거절 사유. 값은 시그널링 메시지의 reason으로 나간다. */
    public enum Rejection {
        INVALID_KEY("invalid-key"),
        ALREADY_BROADCASTING("already-broadcasting"),
        ENDED("ended"),
        NOT_FOUND("not-found"),
        NOT_BROADCASTING("not-broadcasting"),
        ALREADY_JOINED("already-joined");

        private final String reason;

        Rejection(String reason) {
            this.reason = reason;
        }

        public String reason() {
            return reason;
        }
    }

    static JoinResult accepted() {
        return new JoinResult(null);
    }

    static JoinResult rejected(Rejection rejection) {
        return new JoinResult(rejection);
    }

    public boolean isAccepted() {
        return rejection == null;
    }
}

package com.onair.broadcast;

import java.util.Optional;

/** 재생 시간(초). 0보다 큰 유한한 숫자만 만들어진다. */
record DurationSeconds(double value) {

    DurationSeconds {
        if (!Double.isFinite(value) || value <= 0) {
            throw new IllegalArgumentException("재생 시간은 0보다 큰 숫자여야 합니다: " + value);
        }
    }

    /** 문자열을 해석한다. 숫자가 아니거나 0 이하면 비어 있다. */
    static Optional<DurationSeconds> parse(String raw) {
        try {
            return Optional.of(new DurationSeconds(Double.parseDouble(raw.strip())));
        } catch (IllegalArgumentException e) {
            // NumberFormatException도 IllegalArgumentException이다.
            return Optional.empty();
        }
    }
}

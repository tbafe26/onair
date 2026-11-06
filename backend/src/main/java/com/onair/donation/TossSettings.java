package com.onair.donation;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 토스페이먼츠 설정. 키는 환경변수로만 받고 저장소에 두지 않는다. */
@Component
class TossSettings {

    private final String clientKey;
    private final String secretKey;

    TossSettings(@Value("${app.toss.client-key:}") String clientKey,
            @Value("${app.toss.secret-key:}") String secretKey) {
        this.clientKey = clientKey.strip();
        this.secretKey = secretKey.strip();
    }

    boolean configured() {
        return !clientKey.isEmpty() && !secretKey.isEmpty();
    }

    String clientKey() {
        return clientKey;
    }
}

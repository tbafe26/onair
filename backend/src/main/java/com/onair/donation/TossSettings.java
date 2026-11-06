package com.onair.donation;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 토스페이먼츠 설정. 키는 환경변수로만 받고 저장소에 두지 않는다. */
@Component
class TossSettings {

    private final String clientKey;
    private final String secretKey;
    private final String testCode;
    private final String baseUrl;

    TossSettings(@Value("${app.toss.client-key:}") String clientKey,
            @Value("${app.toss.secret-key:}") String secretKey,
            @Value("${app.toss.test-code:}") String testCode,
            @Value("${app.toss.base-url:https://api.tosspayments.com}") String baseUrl) {
        this.clientKey = clientKey.strip();
        this.secretKey = secretKey.strip();
        this.testCode = testCode.strip();
        this.baseUrl = baseUrl.strip();
    }

    boolean configured() {
        return !clientKey.isEmpty() && !secretKey.isEmpty();
    }

    String clientKey() {
        return clientKey;
    }

    String secretKey() {
        return secretKey;
    }

    String baseUrl() {
        return baseUrl;
    }

    /** 승인 요청에 붙일 테스트 코드. 테스트 시크릿 키일 때만 값이 있고, 아니면 빈 값이다. */
    String effectiveTestCode() {
        return secretKey.startsWith("test_") ? testCode : "";
    }
}

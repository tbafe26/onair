package com.onair.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** 모든 API 테스트가 같은 컨텍스트를 쓰도록 ApiTestSupport에서 가져오는 가짜 결제 서비스 설정. 실제 토스는 부르지 않는다. */
@TestConfiguration
class TestPaymentConfig {

    @Bean
    @Primary
    FakePaymentGateway fakePaymentGateway() {
        return new FakePaymentGateway();
    }
}

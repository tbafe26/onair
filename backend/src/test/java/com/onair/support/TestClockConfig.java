package com.onair.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** 모든 API 테스트가 같은 컨텍스트를 쓰도록 ApiTestSupport에서 가져오는 시계 설정. */
@TestConfiguration
class TestClockConfig {

    @Bean
    @Primary
    MutableClock testClock() {
        return new MutableClock();
    }
}

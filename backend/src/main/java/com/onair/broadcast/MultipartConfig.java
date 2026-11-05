package com.onair.broadcast;

import jakarta.servlet.MultipartConfigElement;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 멀티파트 상한. 크기는 모두 RegistrationRules가 정한다. */
@Configuration
class MultipartConfig {

    @Bean
    MultipartConfigElement multipartConfigElement(RegistrationRules rules) {
        return new MultipartConfigElement(null, rules.maxVideoBytes(), rules.maxRequestBytes(), 0);
    }
}

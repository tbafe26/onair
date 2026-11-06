package com.onair.donation;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/** 운영의 결제 서비스 adapter. 연결과 응답에 시간 제한을 둬 결제 서비스가 느려도 요청 스레드가 오래 묶이지 않게 한다. */
@Configuration
class PaymentGatewayConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(10);

    @Bean
    PaymentGateway paymentGateway(TossSettings settings) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build());
        factory.setReadTimeout(READ_TIMEOUT);
        RestClient client = RestClient.builder().baseUrl(settings.baseUrl()).requestFactory(factory).build();
        return new TossPaymentGateway(client, settings);
    }
}

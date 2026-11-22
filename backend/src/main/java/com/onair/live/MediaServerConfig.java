package com.onair.live;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/** 미디어 서버 adapter. 5초마다 부르므로 응답이 늦으면 다음 차례로 넘기도록 시간 제한을 짧게 둔다. */
@Configuration
class MediaServerConfig {

    private static final Duration TIMEOUT = Duration.ofSeconds(2);

    @Bean
    MediaServer mediaServer(@Value("${app.media.api-url}") String apiUrl) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(TIMEOUT).build());
        factory.setReadTimeout(TIMEOUT);
        return new MediaMtxApi(RestClient.builder().baseUrl(apiUrl).requestFactory(factory).build());
    }
}

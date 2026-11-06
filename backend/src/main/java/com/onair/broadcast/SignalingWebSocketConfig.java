package com.onair.broadcast;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * 시그널링 WebSocket 등록. CORS는 쓰지 않고 WebSocket의 Origin 검사만 설정한다.
 * 개발 중에는 Vite 프록시가 요청을 넘기므로 Origin은 개발 서버 주소이고 Host는 8080이라 허용 Origin을 따로 둔다.
 */
@Configuration
@EnableWebSocket
class SignalingWebSocketConfig implements WebSocketConfigurer {

    static final String SIGNAL_PATH = "/api/broadcasts/*/signal";

    private final SignalingWebSocketHandler handler;
    private final String[] allowedOriginPatterns;

    SignalingWebSocketConfig(
            SignalingWebSocketHandler handler,
            @Value("${app.signal.allowed-origins}") String[] allowedOriginPatterns) {
        this.handler = handler;
        this.allowedOriginPatterns = allowedOriginPatterns;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, SIGNAL_PATH).setAllowedOriginPatterns(allowedOriginPatterns);
    }
}

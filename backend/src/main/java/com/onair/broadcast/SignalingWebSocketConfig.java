package com.onair.broadcast;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * 시그널링과 채팅 WebSocket 등록. CORS는 쓰지 않고 WebSocket의 Origin 검사만 설정한다.
 * 개발 중에는 Vite 프록시가 요청을 넘기므로 Origin은 개발 서버 주소이고 Host는 8080이라 허용 Origin을 따로 둔다.
 */
@Configuration
@EnableWebSocket
class SignalingWebSocketConfig implements WebSocketConfigurer {

    static final String SIGNAL_PATH = "/api/broadcasts/*/signal";
    static final String CHAT_PATH = "/api/broadcasts/*/chat";

    private final SignalingWebSocketHandler handler;
    private final ChatWebSocketHandler chatHandler;
    private final String[] allowedOriginPatterns;

    SignalingWebSocketConfig(
            SignalingWebSocketHandler handler,
            ChatWebSocketHandler chatHandler,
            @Value("${app.signal.allowed-origins}") String[] allowedOriginPatterns) {
        this.handler = handler;
        this.chatHandler = chatHandler;
        this.allowedOriginPatterns = allowedOriginPatterns;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, SIGNAL_PATH)
                .addInterceptors(new LoginUserHandshakeInterceptor())
                .setAllowedOriginPatterns(allowedOriginPatterns);
        registry.addHandler(chatHandler, CHAT_PATH)
                .setAllowedOriginPatterns(allowedOriginPatterns);
    }
}

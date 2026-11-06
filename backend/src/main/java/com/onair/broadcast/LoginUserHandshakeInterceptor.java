package com.onair.broadcast;

import com.onair.auth.AuthenticatedUser;
import java.util.Map;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

/**
 * 핸드셰이크 요청에 실린 세션 쿠키로 로그인 사용자를 알아내 WebSocket 세션 속성에 id를 복사한다.
 * 로그인하지 않았으면 속성을 넣지 않는다(시청자는 로그인 없이 연결한다). 이미 맺은 연결은 이후 로그아웃해도 끊지 않는다.
 */
class LoginUserHandshakeInterceptor implements HandshakeInterceptor {

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler handler, Map<String, Object> attributes) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
            attributes.put(SignalingWebSocketHandler.USER_ID_ATTRIBUTE, user.id());
        }
        return true;
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler handler, Exception exception) {
    }
}

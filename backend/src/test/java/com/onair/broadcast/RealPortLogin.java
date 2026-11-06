package com.onair.broadcast;

import com.onair.auth.Csrf;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

/** 실제 포트로 띄운 서버에 가입해, 이후 요청에 실을 Cookie 헤더 값(세션과 CSRF 토큰)을 돌려준다. */
final class RealPortLogin {

    private RealPortLogin() {
    }

    static String signUp(int port, String loginId, String nickname) {
        List<String> setCookies = RestClient.create("http://localhost:" + port).post()
                .uri("/api/auth/signup")
                .header("Cookie", Csrf.COOKIE + "=" + Csrf.TOKEN)
                .header(Csrf.HEADER, Csrf.TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("loginId", loginId, "password", "password-1234", "nickname", nickname))
                .retrieve()
                .toBodilessEntity()
                .getHeaders()
                .get(HttpHeaders.SET_COOKIE);
        String session = setCookies.stream()
                .filter(cookie -> cookie.startsWith("JSESSIONID="))
                .map(cookie -> cookie.substring(0, cookie.indexOf(';')))
                .findFirst()
                .orElseThrow();
        return Csrf.COOKIE + "=" + Csrf.TOKEN + "; " + session;
    }
}

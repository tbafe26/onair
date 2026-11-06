package com.onair.auth;

import jakarta.servlet.http.Cookie;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** 테스트용 CSRF 토큰. 쿠키와 헤더에 같은 값을 실어, 서버가 실제로 하는 대조를 그대로 거치게 한다. */
public final class Csrf {

    public static final String COOKIE = "XSRF-TOKEN";
    public static final String HEADER = "X-XSRF-TOKEN";
    public static final String TOKEN = "test-csrf-token";

    private Csrf() {
    }

    public static RequestPostProcessor token() {
        return request -> {
            request.setCookies(new Cookie(COOKIE, TOKEN));
            request.addHeader(HEADER, TOKEN);
            return request;
        };
    }
}

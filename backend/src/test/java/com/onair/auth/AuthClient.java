package com.onair.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.json.JsonMapper;

/**
 * 브라우저 한 대의 흉내. 세션 쿠키와 CSRF 토큰 쿠키를 들고 있다가 요청마다 실어 보낸다.
 * 가짜 인증을 주입하지 않고 실제 가입·로그인 요청으로 로그인 상태를 만든다.
 */
public final class AuthClient {

    public static final String PASSWORD = "password-1234";

    /** Spring Session이 세션 id를 싣는 쿠키 이름. */
    public static final String SESSION_COOKIE = "SESSION";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final MockMvc mockMvc;
    private String sessionCookie;
    private String csrf;
    private long userId;

    private AuthClient(MockMvc mockMvc) {
        this.mockMvc = mockMvc;
    }

    /** 앱을 처음 연 방문자. 시작할 때 me를 불러 CSRF 토큰 쿠키를 받는다. */
    public static AuthClient visitor(MockMvc mockMvc) throws Exception {
        AuthClient client = new AuthClient(mockMvc);
        client.me();
        return client;
    }

    /** 가입하고 로그인된 사용자. */
    public static AuthClient signedUp(MockMvc mockMvc, String loginId, String nickname) throws Exception {
        AuthClient client = visitor(mockMvc);
        client.signup(loginId, PASSWORD, nickname);
        return client;
    }

    public ResultActions me() throws Exception {
        return remember(mockMvc.perform(get("/api/auth/me").with(session())));
    }

    public ResultActions signup(String loginId, String password, String nickname) throws Exception {
        return rememberUser(remember(mockMvc.perform(post("/api/auth/signup").with(credentials())
                .contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(Map.of("loginId", loginId, "password", password, "nickname", nickname))))));
    }

    public ResultActions login(String loginId, String password) throws Exception {
        return rememberUser(remember(mockMvc.perform(post("/api/auth/login").with(credentials())
                .contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(Map.of("loginId", loginId, "password", password))))));
    }

    public ResultActions logout() throws Exception {
        return remember(mockMvc.perform(post("/api/auth/logout").with(credentials())));
    }

    /** 마지막으로 가입·로그인에 성공한 사용자의 id. */
    public long userId() {
        return userId;
    }

    /** 마지막으로 받은 CSRF 토큰 쿠키 값. */
    public String csrfToken() {
        return csrf;
    }

    public String sessionCookie() {
        return sessionCookie;
    }

    public RequestPostProcessor session() {
        return request -> {
            request.setCookies(cookies(false));
            return request;
        };
    }

    /** 세션 쿠키와 CSRF 토큰(쿠키와 헤더)을 싣는다(상태를 바꾸는 요청). */
    public RequestPostProcessor credentials() {
        return request -> {
            request.setCookies(cookies(true));
            if (csrf != null) {
                request.addHeader(Csrf.HEADER, csrf);
            }
            return request;
        };
    }

    private Cookie[] cookies(boolean withCsrf) {
        List<Cookie> cookies = new ArrayList<>();
        if (sessionCookie != null) {
            cookies.add(new Cookie(SESSION_COOKIE, sessionCookie));
        }
        if (withCsrf && csrf != null) {
            cookies.add(new Cookie(Csrf.COOKIE, csrf));
        }
        return cookies.toArray(Cookie[]::new);
    }

    private ResultActions rememberUser(ResultActions result) throws Exception {
        var response = result.andReturn().getResponse();
        if (response.getStatus() < 300) {
            userId = JSON.readTree(response.getContentAsString()).get("id").asLong();
        }
        return result;
    }

    private ResultActions remember(ResultActions result) {
        // 같은 응답에 같은 쿠키가 여러 번 실리면 브라우저처럼 마지막 것이 이기고, 만료(Max-Age=0)는 지운다.
        for (Cookie cookie : result.andReturn().getResponse().getCookies()) {
            boolean expired = cookie.getMaxAge() == 0;
            if (Csrf.COOKIE.equals(cookie.getName()) && !expired) {
                csrf = cookie.getValue();
            } else if (SESSION_COOKIE.equals(cookie.getName())) {
                sessionCookie = expired ? null : cookie.getValue();
            }
        }
        return result;
    }
}

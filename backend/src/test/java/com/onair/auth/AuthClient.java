package com.onair.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import jakarta.servlet.http.Cookie;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.json.JsonMapper;

/**
 * 브라우저 한 대의 흉내. 세션과 CSRF 토큰 쿠키를 들고 있다가 요청마다 실어 보낸다.
 * 가짜 인증을 주입하지 않고 실제 가입·로그인 요청으로 로그인 상태를 만든다.
 */
public final class AuthClient {

    public static final String PASSWORD = "password-1234";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final MockMvc mockMvc;
    private final MockHttpSession session = new MockHttpSession();
    private String csrf;

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
        return remember(mockMvc.perform(post("/api/auth/signup").with(credentials())
                .contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(Map.of("loginId", loginId, "password", password, "nickname", nickname)))));
    }

    public ResultActions login(String loginId, String password) throws Exception {
        return remember(mockMvc.perform(post("/api/auth/login").with(credentials())
                .contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(Map.of("loginId", loginId, "password", password)))));
    }

    public ResultActions logout() throws Exception {
        return remember(mockMvc.perform(post("/api/auth/logout").with(credentials())));
    }

    public String sessionId() {
        return session.getId();
    }

    /** 세션만 싣는다(읽기 요청). */
    public RequestPostProcessor session() {
        return request -> {
            request.setSession(session);
            request.setRequestedSessionId(session.getId());
            return request;
        };
    }

    /** 세션과 CSRF 토큰(쿠키와 헤더)을 싣는다(상태를 바꾸는 요청). */
    public RequestPostProcessor credentials() {
        return request -> {
            request.setSession(session);
            request.setRequestedSessionId(session.getId());
            if (csrf != null) {
                request.setCookies(new Cookie(Csrf.COOKIE, csrf));
                request.addHeader(Csrf.HEADER, csrf);
            }
            return request;
        };
    }

    private ResultActions remember(ResultActions result) {
        Cookie cookie = result.andReturn().getResponse().getCookie(Csrf.COOKIE);
        if (cookie != null && cookie.getMaxAge() != 0) {
            csrf = cookie.getValue();
        }
        return result;
    }
}

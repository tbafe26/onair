package com.onair.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.broadcast.ApiTestSupport;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/** 인증 REST 면: 가입, 로그인, me, 로그아웃, CSRF. 실제 보안 필터와 실제 가입·로그인 흐름을 거친다. */
class AuthApiTest extends ApiTestSupport {

    @Test
    void 가입하면_201과_내_정보를_돌려주고_바로_로그인된다() throws Exception {
        AuthClient client = AuthClient.visitor(mockMvc);

        client.signup("streamer01", AuthClient.PASSWORD, "  방송러  ")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.loginId").value("streamer01"))
                .andExpect(jsonPath("$.nickname").value("방송러"))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        client.me()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.loginId").value("streamer01"))
                .andExpect(jsonPath("$.nickname").value("방송러"));
    }

    @Test
    void 비밀번호는_해시로만_저장된다() throws Exception {
        AuthClient.signedUp(mockMvc, "streamer01", "방송러");

        String stored = jdbc.queryForObject("select password_hash from app_user where login_id = 'streamer01'", String.class);

        assertThat(stored).startsWith("$2").doesNotContain(AuthClient.PASSWORD);
    }

    @Test
    void 이미_쓰는_아이디로_가입하면_409다() throws Exception {
        AuthClient.signedUp(mockMvc, "streamer01", "먼저");

        AuthClient.visitor(mockMvc).signup("streamer01", AuthClient.PASSWORD, "나중")
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("이미 사용 중인 아이디입니다"));
    }

    @Test
    void 규칙에_맞지_않는_값은_칸별_400이다() throws Exception {
        AuthClient.visitor(mockMvc).signup("AB", "short", "   ")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.errors[?(@.field == 'loginId')].reason").isNotEmpty())
                .andExpect(jsonPath("$.errors[?(@.field == 'password')].reason").isNotEmpty())
                .andExpect(jsonPath("$.errors[?(@.field == 'nickname')].reason").isNotEmpty());
        assertThat(jdbc.queryForObject("select count(*) from app_user", Integer.class)).isZero();
    }

    @Test
    void 경계_길이는_받아들이고_한_글자_넘으면_거절한다() throws Exception {
        AuthClient.visitor(mockMvc).signup("a1b2", "p".repeat(8), "닉").andExpect(status().isCreated());
        AuthClient.visitor(mockMvc).signup("a".repeat(20), "p".repeat(64), "가".repeat(20)).andExpect(status().isCreated());
        AuthClient.visitor(mockMvc).signup("a".repeat(21), "p".repeat(65), "가".repeat(21))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.length()").value(3));
    }

    @Test
    void 아이디는_영문_소문자와_숫자만_쓸_수_있다() throws Exception {
        AuthClient.visitor(mockMvc).signup("Stream_01", AuthClient.PASSWORD, "방송러")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("loginId"));
    }

    @Test
    void 요청_본문이_비었거나_깨지면_400이다() throws Exception {
        AuthClient client = AuthClient.visitor(mockMvc);

        mockMvc.perform(post("/api/auth/signup").with(client.credentials())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.length()").value(3));
        mockMvc.perform(post("/api/auth/signup").with(client.credentials())
                        .contentType(MediaType.APPLICATION_JSON).content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
    }

    @Test
    void 로그인하면_200과_내_정보를_돌려주고_세션_id가_바뀐다() throws Exception {
        AuthClient.signedUp(mockMvc, "streamer01", "방송러");
        AuthClient client = AuthClient.visitor(mockMvc);
        client.me();
        String before = client.sessionId();

        client.login("streamer01", AuthClient.PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.loginId").value("streamer01"))
                .andExpect(jsonPath("$.nickname").value("방송러"));

        assertThat(client.sessionId()).isNotEqualTo(before);
        client.me().andExpect(status().isOk());
    }

    @Test
    void 틀린_비밀번호와_없는_아이디는_같은_401이다() throws Exception {
        AuthClient.signedUp(mockMvc, "streamer01", "방송러");

        ResultActions wrongPassword = AuthClient.visitor(mockMvc).login("streamer01", "wrong-password");
        ResultActions unknownId = AuthClient.visitor(mockMvc).login("nobody01", AuthClient.PASSWORD);

        for (ResultActions failed : new ResultActions[] {wrongPassword, unknownId}) {
            failed.andExpect(status().isUnauthorized())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.detail").value("아이디 또는 비밀번호가 올바르지 않습니다"));
        }
    }

    @Test
    void 로그인하지_않은_me는_ProblemDetail_401이고_CSRF_쿠키를_준다() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(cookie().exists(Csrf.COOKIE));
    }

    @Test
    void 로그아웃하면_204이고_같은_세션으로는_401이다() throws Exception {
        AuthClient client = AuthClient.signedUp(mockMvc, "streamer01", "방송러");
        client.me().andExpect(status().isOk());

        client.logout().andExpect(status().isNoContent());

        client.me().andExpect(status().isUnauthorized());
    }

    @Test
    void 로그인하지_않아도_로그아웃은_204다() throws Exception {
        AuthClient.visitor(mockMvc).logout().andExpect(status().isNoContent());
    }

    @Test
    void CSRF_토큰이_없는_상태_변경_요청은_ProblemDetail_403이다() throws Exception {
        mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\":\"streamer01\",\"password\":\"password-1234\",\"nickname\":\"방송러\"}"))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(403));
        mockMvc.perform(post("/api/broadcasts/live").param("title", "토큰 없음"))
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from app_user", Integer.class)).isZero();
    }

    @Test
    void 쿠키와_다른_CSRF_헤더는_403이다() throws Exception {
        mockMvc.perform(post("/api/auth/logout")
                        .cookie(new Cookie(Csrf.COOKIE, "one"))
                        .header(Csrf.HEADER, "other"))
                .andExpect(status().isForbidden());
    }

    @Test
    void 기본_로그인_화면과_HTTP_Basic은_꺼져_있다() throws Exception {
        mockMvc.perform(post("/login").with(Csrf.token()).param("username", "a").param("password", "b"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Basic c3RyZWFtZXIwMTpwYXNzd29yZC0xMjM0"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("WWW-Authenticate"));
    }
}

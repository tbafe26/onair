package com.onair.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.onair.support.TwoServers;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** 서버가 여러 대여도 로그인 상태는 하나다. 서버 1에서 로그인·로그아웃한 결과가 서버 2에서도 같아야 한다. */
class SharedSessionTest {

    private static TwoServers servers;

    @BeforeAll
    static void 서버_두_대를_띄운다() {
        servers = TwoServers.start();
    }

    @AfterAll
    static void 서버를_내린다() {
        servers.close();
    }

    @Test
    void 서버_1에서_로그인하면_서버_2에서도_로그인_상태이고_로그아웃도_함께_적용된다() throws Exception {
        String loginId = "multi" + ThreadLocalRandom.current().nextInt(100_000);
        servers.get(servers.first("/api/auth/me"));

        assertThat(servers.post(servers.first("/api/auth/signup"),
                "{\"loginId\":\"" + loginId + "\",\"password\":\"password-1234\",\"nickname\":\"두서버닉\"}")
                .statusCode()).isEqualTo(201);

        var me = servers.get(servers.second("/api/auth/me"));
        assertThat(me.statusCode()).isEqualTo(200);
        assertThat(me.body()).contains(loginId);

        String beforeLogout = servers.sessionCookie();
        assertThat(servers.getWithSession(servers.second("/api/auth/me"), beforeLogout).statusCode()).isEqualTo(200);
        assertThat(servers.post(servers.first("/api/auth/logout"), null).statusCode()).isEqualTo(204);
        assertThat(servers.get(servers.second("/api/auth/me")).statusCode()).isEqualTo(401);
        // 브라우저는 로그아웃 응답에 따라 쿠키를 지우므로, 서버에서 세션이 지워졌는지는 옛 쿠키를 다시 보내야 알 수 있다.
        assertThat(servers.getWithSession(servers.second("/api/auth/me"), beforeLogout).statusCode()).isEqualTo(401);
    }
}

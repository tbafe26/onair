package com.onair.live;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.onair.auth.Csrf;
import com.onair.comment.Comments;
import com.onair.support.RealPortLogin;
import com.onair.support.TwoServers;
import java.net.URI;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;

/** 채팅·후원·종료는 어느 서버에서 생겨도 모든 서버의 구독자에게 한 번씩 간다. */
class CrossServerChatTest {

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
    void 서버_1에서_쓴_채팅과_종료가_두_서버의_구독자에게_한_번씩_간다() throws Exception {
        String cookie = 로그인한_쿠키();
        int id = 방송을_시작한다(cookie);
        Inbox onFirst = 구독한다(servers.firstPort(), id);
        Inbox onSecond = 구독한다(servers.secondPort(), id);

        쓴다(cookie, id, "서버를 넘는 채팅");
        rest(servers.firstPort()).post().uri("/api/broadcasts/" + id + "/end")
                .header("Cookie", cookie).header(Csrf.HEADER, Csrf.TOKEN)
                .retrieve().toBodilessEntity();

        for (Inbox inbox : new Inbox[] {onFirst, onSecond}) {
            String comment = inbox.next();
            assertThat((String) JsonPath.read(comment, "$.type")).isEqualTo("comment");
            assertThat((String) JsonPath.read(comment, "$.comment.content")).isEqualTo("서버를 넘는 채팅");
            assertThat((String) JsonPath.read(inbox.next(), "$.type")).isEqualTo("ended");
            assertThat(inbox.closed.poll(10, TimeUnit.SECONDS)).isNotNull();
            assertThat(inbox.messages).isEmpty();
        }
    }

    @Test
    void 서버_1에서_확정된_후원이_서버_2의_구독자에게_간다() throws Exception {
        String cookie = 로그인한_쿠키();
        int id = 방송을_시작한다(cookie);
        Inbox onSecond = 구독한다(servers.secondPort(), id);

        servers.firstBean(LiveChat.class).publishDonation(id, Map.of("amount", 5000, "message", "응원해요"));

        String donation = onSecond.next();
        assertThat((String) JsonPath.read(donation, "$.type")).isEqualTo("donation");
        assertThat((Integer) JsonPath.read(donation, "$.donation.amount")).isEqualTo(5000);
    }

    @Test
    void 되돌린_트랜잭션에서_쓴_채팅은_어느_서버에도_가지_않는다() throws Exception {
        String cookie = 로그인한_쿠키();
        int id = 방송을_시작한다(cookie);
        long userId = 내_id(cookie);
        Inbox onSecond = 구독한다(servers.secondPort(), id);

        new TransactionTemplate(servers.firstBean(PlatformTransactionManager.class)).executeWithoutResult(status -> {
            servers.firstBean(Comments.class).write(id, userId, "되돌릴 채팅");
            status.setRollbackOnly();
        });
        쓴다(cookie, id, "뒤따르는 채팅");

        assertThat((String) JsonPath.read(onSecond.next(), "$.comment.content")).isEqualTo("뒤따르는 채팅");
    }

    @Test
    void 알림_연결이_끊기면_구독자를_닫아_다시_접속하게_하고_다시_연결한_뒤에는_전달된다() throws Exception {
        String cookie = 로그인한_쿠키();
        int id = 방송을_시작한다(cookie);
        Inbox before = 구독한다(servers.secondPort(), id);

        servers.firstBean(JdbcTemplate.class).query(
                "select pg_terminate_backend(pid) from pg_stat_activity where query = 'LISTEN chat'", rs -> null);

        assertThat(before.closed.poll(10, TimeUnit.SECONDS)).as("끊긴 뒤 닫힌 구독").isNotNull();
        // 화면처럼 다시 접속한다. 다시 연결되기 전이나 다시 연결하며 닫힌 구독은 받지 못하므로 몇 번 다시 시도한다.
        String received = null;
        for (int attempt = 1; attempt <= 10 && received == null; attempt++) {
            Inbox after = 구독한다(servers.secondPort(), id);
            쓴다(cookie, id, "다시 연결한 뒤의 채팅 " + attempt);
            received = after.messages.poll(2, TimeUnit.SECONDS);
        }
        assertThat(received).as("다시 연결한 뒤 받은 채팅").isNotNull();
        assertThat((String) JsonPath.read(received, "$.comment.content")).startsWith("다시 연결한 뒤의 채팅");
    }

    private static RestClient rest(int port) {
        return RestClient.create("http://localhost:" + port);
    }

    private static String 로그인한_쿠키() {
        return RealPortLogin.signUp(servers.firstPort(),
                "x" + UUID.randomUUID().toString().replace("-", "").substring(0, 12), "넘나드는닉");
    }

    private static long 내_id(String cookie) {
        String me = rest(servers.secondPort()).get().uri("/api/auth/me").header("Cookie", cookie)
                .retrieve().body(String.class);
        return ((Number) JsonPath.read(me, "$.id")).longValue();
    }

    private static int 방송을_시작한다(String cookie) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("title", "두 서버 채팅 방송");
        String started = rest(servers.firstPort()).post().uri("/api/broadcasts/live")
                .header("Cookie", cookie).header(Csrf.HEADER, Csrf.TOKEN)
                .contentType(MediaType.MULTIPART_FORM_DATA).body(body)
                .retrieve().body(String.class);
        return JsonPath.read(started, "$.id");
    }

    private static Inbox 구독한다(int port, int id) throws Exception {
        Inbox inbox = new Inbox();
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.add(HttpHeaders.ORIGIN, Inbox.DEV_SERVER_ORIGIN);
        new StandardWebSocketClient()
                .execute(inbox, headers, URI.create("ws://localhost:" + port + "/api/broadcasts/" + id + "/chat"))
                .get(10, TimeUnit.SECONDS);
        return inbox;
    }

    private static void 쓴다(String cookie, int id, String content) {
        rest(servers.firstPort()).post().uri("/api/broadcasts/" + id + "/comments")
                .header("Cookie", cookie).header(Csrf.HEADER, Csrf.TOKEN)
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("content", content))
                .retrieve().toBodilessEntity();
    }
}

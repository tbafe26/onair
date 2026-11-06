package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jayway.jsonpath.JsonPath;
import com.onair.auth.Csrf;
import com.onair.broadcast.SignalingWebSocketTest.Inbox;
import java.net.URI;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;

/** 채팅 WebSocket adapter 통합 테스트. 실제 포트로 띄워 REST로 쓴 채팅이 WebSocket에 도착하는지 확인한다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ChatWebSocketTest {

    @LocalServerPort
    int port;

    RestClient rest() {
        return RestClient.create("http://localhost:" + port);
    }

    String 쿠키() {
        return RealPortLogin.signUp(port, "c" + UUID.randomUUID().toString().replace("-", "").substring(0, 12), "채팅러");
    }

    int 방송을_시작한다(String cookie) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("title", "채팅 통합 방송");
        String started = rest().post().uri("/api/broadcasts/live")
                .header("Cookie", cookie)
                .header(Csrf.HEADER, Csrf.TOKEN)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(String.class);
        return JsonPath.read(started, "$.id");
    }

    WebSocketSession 구독한다(int id, String origin, Inbox inbox) throws Exception {
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.add(HttpHeaders.ORIGIN, origin);
        return new StandardWebSocketClient()
                .execute(inbox, headers, URI.create("ws://localhost:" + port + "/api/broadcasts/" + id + "/chat"))
                .get(10, TimeUnit.SECONDS);
    }

    void 쓴다(String cookie, int id, String content) {
        rest().post().uri("/api/broadcasts/" + id + "/comments")
                .header("Cookie", cookie)
                .header(Csrf.HEADER, Csrf.TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("content", content))
                .retrieve()
                .toBodilessEntity();
    }

    @Test
    void REST로_쓴_채팅이_구독한_WebSocket에_도착하고_방송이_끝나면_ended와_함께_닫힌다() throws Exception {
        String cookie = 쿠키();
        int id = 방송을_시작한다(cookie);
        Inbox inbox = new Inbox();
        구독한다(id, SignalingWebSocketTest.DEV_SERVER_ORIGIN, inbox);

        쓴다(cookie, id, "실시간 채팅");

        String message = inbox.next();
        assertThat((String) JsonPath.read(message, "$.type")).isEqualTo("comment");
        assertThat((String) JsonPath.read(message, "$.comment.content")).isEqualTo("실시간 채팅");
        assertThat((String) JsonPath.read(message, "$.comment.author.nickname")).isEqualTo("채팅러");
        assertThat((Integer) JsonPath.read(message, "$.comment.id")).isPositive();
        assertThat((String) JsonPath.read(message, "$.comment.createdAt")).contains("T");

        rest().post().uri("/api/broadcasts/" + id + "/end")
                .header("Cookie", cookie)
                .header(Csrf.HEADER, Csrf.TOKEN)
                .retrieve()
                .toBodilessEntity();

        assertThat((String) JsonPath.read(inbox.next(), "$.type")).isEqualTo("ended");
        assertThat(inbox.closed.poll(10, TimeUnit.SECONDS)).isNotNull();
    }

    @Test
    void 종료된_방송을_구독하면_바로_ended를_받고_닫힌다() throws Exception {
        String cookie = 쿠키();
        int id = 방송을_시작한다(cookie);
        rest().post().uri("/api/broadcasts/" + id + "/end")
                .header("Cookie", cookie)
                .header(Csrf.HEADER, Csrf.TOKEN)
                .retrieve()
                .toBodilessEntity();
        Inbox inbox = new Inbox();

        구독한다(id, SignalingWebSocketTest.DEV_SERVER_ORIGIN, inbox);

        assertThat((String) JsonPath.read(inbox.next(), "$.type")).isEqualTo("ended");
        assertThat(inbox.closed.poll(10, TimeUnit.SECONDS)).isNotNull();
    }

    @Test
    void 허용되지_않은_Origin의_연결은_거절한다() {
        String cookie = 쿠키();
        int id = 방송을_시작한다(cookie);

        assertThatThrownBy(() -> 구독한다(id, "https://evil.example", new Inbox()))
                .isInstanceOf(ExecutionException.class);
    }
}

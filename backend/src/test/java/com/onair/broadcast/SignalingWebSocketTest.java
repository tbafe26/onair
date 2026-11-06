package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.onair.auth.Csrf;
import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * 시그널링 WebSocket adapter 통합 테스트. 실제 포트로 띄워 JSON이 오가는지, 허용 Origin이 통과하는지 확인한다.
 *
 * <p>ApiTestSupport를 상속하지 않는 이유: MockMvc에는 WebSocket 핸드셰이크가 없어 실제 서버가 필요하다.
 * MultipartLimitApiTest처럼 서블릿 컨테이너를 거쳐야 하는 테스트라 따로 띄운다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SignalingWebSocketTest {

    // 개발 서버(Vite) 주소를 흉내 낸 Origin. 프록시를 거치면 Host는 백엔드 포트지만 Origin은 이 값이다.
    static final String DEV_SERVER_ORIGIN = "https://dev-pc.example:5173";

    @LocalServerPort
    int port;

    /** 서버가 보낸 메시지와 닫힘을 받아 두는 클라이언트 쪽 핸들러. */
    static class Inbox extends TextWebSocketHandler {

        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        final BlockingQueue<CloseStatus> closed = new LinkedBlockingQueue<>();

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            messages.add(message.getPayload());
        }

        @Override
        public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
            closed.add(status);
        }

        String next() throws InterruptedException {
            String message = messages.poll(10, TimeUnit.SECONDS);
            assertThat(message).as("서버가 보낸 메시지").isNotNull();
            return message;
        }
    }

    RestClient rest() {
        return RestClient.create("http://localhost:" + port);
    }

    String 시작한다() {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("title", "통합 테스트 라이브");
        return rest().post().uri("/api/broadcasts/live")
                .header("Cookie", Csrf.COOKIE + "=" + Csrf.TOKEN)
                .header(Csrf.HEADER, Csrf.TOKEN)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(String.class);
    }

    WebSocketSession 연결한다(int broadcastId, String origin, Inbox inbox) throws Exception {
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.add(HttpHeaders.ORIGIN, origin);
        return new StandardWebSocketClient()
                .execute(inbox, headers, URI.create("ws://localhost:" + port + "/api/broadcasts/" + broadcastId + "/signal"))
                .get(10, TimeUnit.SECONDS);
    }

    @Test
    void 허용된_Origin의_송출자가_키로_연결하고_end로_방송을_종료한다() throws Exception {
        String started = 시작한다();
        int id = JsonPath.read(started, "$.id");
        String streamKey = JsonPath.read(started, "$.streamKey");

        // 잘못된 키는 사유와 함께 거절되고 연결이 닫힌다.
        Inbox intruder = new Inbox();
        WebSocketSession intruderSession = 연결한다(id, DEV_SERVER_ORIGIN, intruder);
        intruderSession.sendMessage(new TextMessage("{\"type\":\"join-broadcaster\",\"streamKey\":\"wrong-key\"}"));
        String rejected = intruder.next();
        assertThat((String) JsonPath.read(rejected, "$.type")).isEqualTo("rejected");
        assertThat((String) JsonPath.read(rejected, "$.reason")).isEqualTo("invalid-key");
        assertThat(intruder.closed.poll(10, TimeUnit.SECONDS)).isNotNull();

        // 올바른 키로 연결하고 end를 보내면 ended를 받고 방송이 종료로 기록된다.
        Inbox broadcaster = new Inbox();
        WebSocketSession session = 연결한다(id, DEV_SERVER_ORIGIN, broadcaster);
        session.sendMessage(new TextMessage("{\"type\":\"join-broadcaster\",\"streamKey\":\"" + streamKey + "\"}"));
        String joined = broadcaster.next();
        assertThat((String) JsonPath.read(joined, "$.type")).isEqualTo("joined");

        session.sendMessage(new TextMessage("{\"type\":\"end\"}"));
        assertThat((String) JsonPath.read(broadcaster.next(), "$.type")).isEqualTo("ended");
        assertThat(broadcaster.closed.poll(10, TimeUnit.SECONDS)).isNotNull();

        String detail = rest().get().uri("/api/broadcasts/" + id).retrieve().body(String.class);
        assertThat((String) JsonPath.read(detail, "$.status")).isEqualTo("ENDED");
        assertThat(detail).doesNotContain(streamKey);
    }

    @Test
    void 송출자와_시청자가_offer_answer_candidate를_주고받고_송출이_끝나면_시청자가_ended를_받는다() throws Exception {
        String started = 시작한다();
        int id = JsonPath.read(started, "$.id");
        String streamKey = JsonPath.read(started, "$.streamKey");

        Inbox broadcaster = new Inbox();
        WebSocketSession broadcasterSession = 연결한다(id, DEV_SERVER_ORIGIN, broadcaster);
        broadcasterSession.sendMessage(new TextMessage("{\"type\":\"join-broadcaster\",\"streamKey\":\"" + streamKey + "\"}"));
        assertThat((String) JsonPath.read(broadcaster.next(), "$.type")).isEqualTo("joined");

        Inbox viewer = new Inbox();
        WebSocketSession viewerSession = 연결한다(id, DEV_SERVER_ORIGIN, viewer);
        viewerSession.sendMessage(new TextMessage("{\"type\":\"join-viewer\"}"));
        String viewerJoined = viewer.next();
        assertThat((String) JsonPath.read(viewerJoined, "$.type")).isEqualTo("joined");
        String viewerId = JsonPath.read(viewerJoined, "$.viewerId");

        String viewerArrived = broadcaster.next();
        assertThat((String) JsonPath.read(viewerArrived, "$.type")).isEqualTo("viewer-joined");
        assertThat((String) JsonPath.read(viewerArrived, "$.viewerId")).isEqualTo(viewerId);
        String count = broadcaster.next();
        assertThat((String) JsonPath.read(count, "$.type")).isEqualTo("viewer-count");
        assertThat((Integer) JsonPath.read(count, "$.count")).isEqualTo(1);

        broadcasterSession.sendMessage(new TextMessage(
                "{\"type\":\"offer\",\"to\":\"" + viewerId + "\",\"sdp\":\"offer-sdp\"}"));
        String offer = viewer.next();
        assertThat((String) JsonPath.read(offer, "$.type")).isEqualTo("offer");
        assertThat((String) JsonPath.read(offer, "$.sdp")).isEqualTo("offer-sdp");

        // 시청자가 보낸 from은 무시되고 서버가 부여한 번호가 붙는다.
        viewerSession.sendMessage(new TextMessage("{\"type\":\"answer\",\"sdp\":\"answer-sdp\",\"from\":\"forged\"}"));
        String answer = broadcaster.next();
        assertThat((String) JsonPath.read(answer, "$.type")).isEqualTo("answer");
        assertThat((String) JsonPath.read(answer, "$.from")).isEqualTo(viewerId);
        assertThat((String) JsonPath.read(answer, "$.sdp")).isEqualTo("answer-sdp");

        viewerSession.sendMessage(new TextMessage("{\"type\":\"candidate\",\"candidate\":\"cand\"}"));
        String candidate = broadcaster.next();
        assertThat((String) JsonPath.read(candidate, "$.type")).isEqualTo("candidate");
        assertThat((String) JsonPath.read(candidate, "$.from")).isEqualTo(viewerId);

        broadcasterSession.sendMessage(new TextMessage("{\"type\":\"end\"}"));
        assertThat((String) JsonPath.read(broadcaster.next(), "$.type")).isEqualTo("ended");
        assertThat((String) JsonPath.read(viewer.next(), "$.type")).isEqualTo("ended");
        assertThat(viewer.closed.poll(10, TimeUnit.SECONDS)).isNotNull();
    }

    @Test
    void 종료된_방송에_시청자로_연결하면_거절된다() throws Exception {
        String started = 시작한다();
        int id = JsonPath.read(started, "$.id");
        String streamKey = JsonPath.read(started, "$.streamKey");
        Inbox broadcaster = new Inbox();
        WebSocketSession session = 연결한다(id, DEV_SERVER_ORIGIN, broadcaster);
        session.sendMessage(new TextMessage("{\"type\":\"join-broadcaster\",\"streamKey\":\"" + streamKey + "\"}"));
        broadcaster.next();
        session.sendMessage(new TextMessage("{\"type\":\"end\"}"));
        broadcaster.next();

        Inbox viewer = new Inbox();
        WebSocketSession viewerSession = 연결한다(id, DEV_SERVER_ORIGIN, viewer);
        viewerSession.sendMessage(new TextMessage("{\"type\":\"join-viewer\"}"));

        String rejected = viewer.next();
        assertThat((String) JsonPath.read(rejected, "$.type")).isEqualTo("rejected");
        assertThat((String) JsonPath.read(rejected, "$.reason")).isEqualTo("ended");
        assertThat(viewer.closed.poll(10, TimeUnit.SECONDS)).isNotNull();
    }

    @Test
    void 허용되지_않은_Origin은_핸드셰이크에서_거절된다() throws Exception {
        int id = JsonPath.read(시작한다(), "$.id");

        assertThatThrownBy(() -> 연결한다(id, "https://evil.example", new Inbox()))
                .isInstanceOf(ExecutionException.class);
    }
}

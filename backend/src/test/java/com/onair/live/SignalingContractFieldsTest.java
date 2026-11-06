package com.onair.live;

import static org.assertj.core.api.Assertions.assertThat;

import com.onair.broadcast.StartLiveCommand;
import com.onair.support.ApiTestSupport;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 메시지 필드 이름이 공유 계약 파일(contracts/signaling.json)과 같은지 방향별로 확인한다.
 * 서버가 보내는 쪽은 시나리오를 끝까지 돌려 실제로 나간 메시지를 대조하고,
 * 서버가 읽는 쪽은 계약대로 만든 메시지가 처리되는지 확인한다.
 */
class SignalingContractFieldsTest extends ApiTestSupport {

    static final Path CONTRACT = Path.of("..", "contracts", "signaling.json");

    @Autowired
    LiveBroadcasting live;

    final JsonNode messages = JsonMapper.builder().build().readTree(CONTRACT.toFile()).get("messages");

    /** 계약에서 해당 방향의 메시지 종류별 필드 이름. 방향이 없는 종류는 빠진다. */
    Map<String, Set<String>> contractFields(String direction) {
        Map<String, Set<String>> result = new LinkedHashMap<>();
        for (String type : messages.propertyNames()) {
            JsonNode fields = messages.get(type).get(direction);
            if (fields != null) {
                Set<String> names = new LinkedHashSet<>();
                fields.forEach(name -> names.add(name.asString()));
                result.put(type, names);
            }
        }
        return result;
    }

    /** 받은 메시지마다 필드 이름이 계약과 정확히 같은지 보고, 본 종류를 모아 돌려준다. */
    Set<String> assertFieldsMatchContract(List<SignalMessage> received, String direction) {
        Map<String, Set<String>> contracted = contractFields(direction);
        Set<String> seen = new LinkedHashSet<>();
        for (SignalMessage message : received) {
            assertThat(contracted).as("%s 방향에 계약이 없는 종류 %s", direction, message.type())
                    .containsKey(message.type());
            assertThat(message.fields().keySet()).as("%s %s의 필드", direction, message.type())
                    .containsExactlyInAnyOrderElementsOf(contracted.get(message.type()));
            seen.add(message.type());
        }
        return seen;
    }

    @Test
    void 서버가_송출자와_시청자에게_보낸_메시지의_필드는_계약과_같고_계약의_모든_항목이_한_번_이상_나간다() {
        StartedLive started = live.start(new StartLiveCommand("계약 필드", null), owner().userId());
        long id = started.broadcastId();
        RecordingPeer broadcaster = new RecordingPeer();
        RecordingPeer viewer = new RecordingPeer();
        RecordingPeer leaver = new RecordingPeer();
        RecordingPeer lastViewer = new RecordingPeer();

        // 거절: 키가 틀린 송출자, 없는 방송의 시청자
        RecordingPeer rejectedBroadcaster = new RecordingPeer();
        RecordingPeer rejectedViewer = new RecordingPeer();
        live.joinAsBroadcaster(id, "wrong-key", owner().userId(), rejectedBroadcaster);
        live.joinAsViewer(-1, rejectedViewer);

        live.joinAsBroadcaster(id, started.streamKey(), owner().userId(), broadcaster);
        live.joinAsViewer(id, viewer);
        live.joinAsViewer(id, leaver);
        String viewerId = (String) viewer.received.getFirst().fields().get(SignalMessage.Field.VIEWER_ID);

        // 송출자 -> 서버 -> 시청자
        live.relay(broadcaster, SignalMessage.of(SignalMessage.OFFER, "to", viewerId, "sdp", "offer-sdp"));
        live.relay(broadcaster, SignalMessage.of(SignalMessage.CANDIDATE, "to", viewerId, "candidate", Map.of("candidate", "c1")));
        // 시청자 -> 서버 -> 송출자
        live.relay(viewer, SignalMessage.of(SignalMessage.ANSWER, "sdp", "answer-sdp"));
        live.relay(viewer, SignalMessage.of(SignalMessage.CANDIDATE, "candidate", Map.of("candidate", "c2")));
        live.relay(broadcaster, SignalMessage.of(SignalMessage.HEARTBEAT));

        live.leave(leaver);
        live.joinAsViewer(id, lastViewer);
        live.relay(broadcaster, SignalMessage.of(SignalMessage.END));

        List<SignalMessage> broadcasterSide = new ArrayList<>(rejectedBroadcaster.received);
        broadcasterSide.addAll(broadcaster.received);
        List<SignalMessage> viewerSide = new ArrayList<>(rejectedViewer.received);
        viewerSide.addAll(viewer.received);
        viewerSide.addAll(lastViewer.received);

        Set<String> toBroadcaster = assertFieldsMatchContract(broadcasterSide, "server->broadcaster");
        Set<String> toViewer = assertFieldsMatchContract(viewerSide, "server->viewer");

        assertThat(toBroadcaster).as("시나리오가 놓친 server->broadcaster 항목")
                .containsExactlyInAnyOrderElementsOf(contractFields("server->broadcaster").keySet());
        assertThat(toViewer).as("시나리오가 놓친 server->viewer 항목")
                .containsExactlyInAnyOrderElementsOf(contractFields("server->viewer").keySet());
    }

    @Test
    void 서버가_읽는_필드_이름은_계약의_클라이언트_발신_필드와_같다() {
        // 송출 키는 WebSocket adapter가 이 상수로 읽고, to와 sdp, candidate는 중계 모듈이 읽거나 그대로 전달한다.
        assertThat(contractFields("broadcaster->server").get(SignalMessage.JOIN_BROADCASTER))
                .containsExactly(SignalMessage.Field.STREAM_KEY);

        Map<String, Set<String>> fromBroadcaster = contractFields("broadcaster->server");
        Map<String, Set<String>> fromViewer = contractFields("viewer->server");
        assertThat(fromBroadcaster.get(SignalMessage.OFFER))
                .containsExactlyInAnyOrder(SignalMessage.Field.TO, SignalMessage.Field.SDP);
        assertThat(fromBroadcaster.get(SignalMessage.CANDIDATE))
                .containsExactlyInAnyOrder(SignalMessage.Field.TO, SignalMessage.Field.CANDIDATE);
        assertThat(fromViewer.get(SignalMessage.ANSWER)).containsExactly(SignalMessage.Field.SDP);
        assertThat(fromViewer.get(SignalMessage.CANDIDATE)).containsExactly(SignalMessage.Field.CANDIDATE);
    }

    @Test
    void 계약대로_만든_클라이언트_메시지는_서버가_처리해_상대에게_전달한다() {
        StartedLive started = live.start(new StartLiveCommand("계약 입력", null), owner().userId());
        long id = started.broadcastId();
        RecordingPeer broadcaster = new RecordingPeer();
        RecordingPeer viewer = new RecordingPeer();
        live.joinAsBroadcaster(id, started.streamKey(), owner().userId(), broadcaster);
        live.joinAsViewer(id, viewer);
        String viewerId = (String) viewer.received.getFirst().fields().get(SignalMessage.Field.VIEWER_ID);

        Map<String, Object> sample = Map.of("to", viewerId, "sdp", "s", "candidate", Map.of("candidate", "c"));
        for (var entry : contractFields("broadcaster->server").entrySet()) {
            Map<String, Object> fields = new LinkedHashMap<>();
            entry.getValue().forEach(name -> fields.put(name, sample.get(name)));
            if (SignalMessage.OFFER.equals(entry.getKey()) || SignalMessage.CANDIDATE.equals(entry.getKey())) {
                viewer.received.clear();
                live.relay(broadcaster, new SignalMessage(entry.getKey(), fields));
                assertThat(viewer.types()).as("송출자 %s는 시청자에게 간다", entry.getKey()).containsExactly(entry.getKey());
                assertThat(viewer.last().fields()).containsKeys(
                        entry.getValue().stream().filter(name -> !"to".equals(name)).toArray(String[]::new));
            }
        }
        for (var entry : contractFields("viewer->server").entrySet()) {
            Map<String, Object> fields = new LinkedHashMap<>();
            entry.getValue().forEach(name -> fields.put(name, sample.get(name)));
            if (SignalMessage.ANSWER.equals(entry.getKey()) || SignalMessage.CANDIDATE.equals(entry.getKey())) {
                broadcaster.received.clear();
                live.relay(viewer, new SignalMessage(entry.getKey(), fields));
                assertThat(broadcaster.types()).as("시청자 %s는 송출자에게 간다", entry.getKey())
                        .containsExactly(entry.getKey());
                assertThat(broadcaster.last().fields()).containsKeys(
                        entry.getValue().toArray(String[]::new));
            }
        }
    }
}

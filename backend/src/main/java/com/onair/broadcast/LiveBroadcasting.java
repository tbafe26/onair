package com.onair.broadcast;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 라이브방송의 수명 주기를 맡는 깊은 모듈: 시작, 송출자·시청자 연결, 시그널링 중계, 종료.
 * 라이브방송의 상태를 바꾸는 코드는 여기에만 있다. REST와 WebSocket은 이 모듈을 부르는 얇은 adapter다.
 *
 * <p>방 표({@link LiveRooms})는 서버 메모리에 둔다(서버 한 대 전제). 표와 DB 변경은 같은 잠금 안에서 하고,
 * DB 반영이 끝난 뒤에 잠금을 놓아 다른 연결이 종료 전 상태를 읽지 못하게 한다.
 * 방 표는 스레드 안전하지 않으며 이 클래스의 잠금 안에서만 쓴다.
 */
@Service
public class LiveBroadcasting {

    private final BroadcastRepository repository;
    private final MediaStorage storage;
    private final RegistrationRules rules;
    private final TransactionTemplate transaction;
    private final Clock clock;
    private final LiveRooms rooms;

    /** 마지막 생존 신호에서 이 시간이 지나도록 연락이 없으면 송출자가 사라진 것으로 본다. */
    static final Duration SILENCE_LIMIT = Duration.ofSeconds(30);

    private static final Set<String> RELAYED_TYPES =
            Set.of(SignalMessage.OFFER, SignalMessage.ANSWER, SignalMessage.CANDIDATE);

    LiveBroadcasting(
            BroadcastRepository repository,
            MediaStorage storage,
            RegistrationRules rules,
            PlatformTransactionManager transactionManager,
            Clock clock,
            @Value("${app.live.max-viewers:5}") int maxViewers) {
        this.clock = clock;
        this.rooms = new LiveRooms(maxViewers);
        this.repository = repository;
        this.storage = storage;
        this.rules = rules;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    /** 입력을 검사하고 방송 중인 라이브방송을 저장한 뒤 송출 키를 발급한다. 키 원문은 여기서 돌려주는 값에만 있다. */
    public StartedLive start(StartLiveCommand command) {
        StartLiveCommand valid = rules.validate(command);
        String streamKey = StreamKeys.generate();

        try (MediaStorage.Batch batch = storage.begin()) {
            String thumbnailKey = valid.thumbnail() == null
                    ? null : MultipartInputs.store(batch, valid.thumbnail());
            LiveBroadcast saved = repository.save(new LiveBroadcast(
                    valid.title(), StreamKeys.hash(streamKey), thumbnailKey, clock.instant()));
            batch.commit();
            return new StartedLive(saved.getId(), streamKey);
        }
    }

    /**
     * 송출자로 연결한다. 방송이 없거나, 종료됐거나, 키가 다르거나, 이미 송출자가 있으면 거절한다.
     * 결과는 peer에게도 보낸다(joined 또는 rejected). 거절하면 연결을 닫는다.
     */
    public synchronized JoinResult joinAsBroadcaster(long broadcastId, String streamKey, Peer peer) {
        JoinResult result = transaction.execute(status -> check(broadcastId, streamKey, peer));
        if (result == null || !result.isAccepted()) {
            return reject(peer, result);
        }
        rooms.registerBroadcaster(broadcastId, peer, clock.instant());
        peer.send(SignalMessage.of(SignalMessage.JOINED, "broadcastId", broadcastId));
        return result;
    }

    /**
     * 시청자로 연결한다. 방송이 없거나, 종료됐거나, 송출자가 아직 연결되지 않았으면 거절하고, 동시 시청자가 상한에 이르렀으면 full로 거절한다.
     * 받아들이면 시청자 번호를 부여해 시청자에게 joined를, 송출자에게 viewer-joined와 viewer-count를 보낸다.
     */
    public synchronized JoinResult joinAsViewer(long broadcastId, Peer peer) {
        JoinResult result = transaction.execute(status -> checkViewer(broadcastId, peer));
        if (result == null || !result.isAccepted()) {
            return reject(peer, result);
        }
        String viewerId = rooms.assignSeat(broadcastId, peer).orElseThrow();
        peer.send(SignalMessage.of(SignalMessage.JOINED, "viewerId", viewerId));
        rooms.broadcasterOf(broadcastId)
                .ifPresent(b -> b.send(SignalMessage.of(SignalMessage.VIEWER_JOINED, "viewerId", viewerId)));
        sendViewerCount(broadcastId);
        return result;
    }

    /**
     * 연결이 보낸 메시지를 처리한다.
     * 송출자: end는 방송 종료, offer/answer/candidate는 to로 지정한 시청자에게만 전달한다.
     * 시청자: offer/answer/candidate는 송출자에게만 전달하고, 보낸 시청자 번호(from)는 서버가 채운다.
     * 어느 쪽도 아닌 연결의 메시지는 무시한다.
     */
    public synchronized void relay(Peer from, SignalMessage message) {
        Optional<Long> broadcastId = rooms.broadcastIdOf(from);
        if (broadcastId.isPresent()) {
            relayFromBroadcaster(broadcastId.get(), from, message);
            return;
        }
        rooms.seatOf(from).ifPresent(seat -> {
            if (RELAYED_TYPES.contains(message.type())) {
                rooms.broadcasterOf(seat.broadcastId())
                        .ifPresent(b -> b.send(forward(message, seat.viewerId())));
            }
        });
    }

    /** 연결이 끊겼다. 송출자였다면 방송을 종료로 저장하고, 시청자였다면 자리를 비우고 송출자에게 알린다. */
    public synchronized void leave(Peer peer) {
        Optional<Long> broadcastId = rooms.broadcastIdOf(peer);
        if (broadcastId.isPresent()) {
            finish(broadcastId.get());
            return;
        }
        rooms.releaseSeat(peer).ifPresent(seat ->
                rooms.broadcasterOf(seat.broadcastId()).ifPresent(b -> {
                    b.send(SignalMessage.of(SignalMessage.VIEWER_LEFT, "viewerId", seat.viewerId()));
                    sendViewerCount(seat.broadcastId());
                }));
    }

    /**
     * 마지막 생존 신호에서 30초가 지난 방송을 종료한다. 송출자가 연결된 방송은 마지막 heartbeat 시각을,
     * 연결되지 않은 방송은 시작 시각을 첫 생존 신호로 본다. 서버가 다시 시작돼 방 표가 비어도
     * 방송 중으로 남은 방송은 DB에서 찾으므로 같은 규칙으로 정리된다.
     * 종료되는 방송의 송출자와 시청자에게는 ended를 보내고 연결을 닫는다.
     */
    public synchronized void expireSilentBroadcasters(Instant now) {
        List<LiveBroadcast> onAir = transaction.execute(status -> repository.findOnAirLives());
        if (onAir == null) {
            return;
        }
        List<Long> silent = new ArrayList<>();
        for (LiveBroadcast live : onAir) {
            Instant lastSignal = rooms.lastSignalOf(live.getId()).orElse(live.getCreatedAt());
            if (now.isAfter(lastSignal.plus(SILENCE_LIMIT))) {
                silent.add(live.getId());
            }
        }
        for (long broadcastId : silent) {
            Optional<Peer> broadcaster = rooms.broadcasterOf(broadcastId);
            finish(broadcastId);
            broadcaster.ifPresent(b -> {
                b.send(SignalMessage.of(SignalMessage.ENDED));
                b.close();
            });
        }
    }

    /**
     * 방송 중으로 남은 라이브방송을 모두 종료한다. 서버가 켜질 때 부른다.
     * 서버가 꺼지면 송출 연결도 끊기므로, 켜진 시점에 방송 중인 방송은 모두 버려진 것이다.
     */
    public synchronized void endAllOnAir() {
        Instant now = clock.instant();
        transaction.executeWithoutResult(status ->
                repository.findOnAirLives().forEach(live -> live.end(now)));
    }

    private void relayFromBroadcaster(long broadcastId, Peer from, SignalMessage message) {
        if (SignalMessage.HEARTBEAT.equals(message.type())) {
            rooms.recordHeartbeat(broadcastId, clock.instant());
        } else if (SignalMessage.END.equals(message.type())) {
            finish(broadcastId);
            from.send(SignalMessage.of(SignalMessage.ENDED));
            from.close();
        } else if (RELAYED_TYPES.contains(message.type())) {
            rooms.viewerOf(broadcastId, message.text("to"))
                    .ifPresent(viewer -> viewer.send(forward(message, null)));
        }
    }

    /** 보낸 쪽이 적은 to와 from은 버리고, 서버가 정한 from(있으면)만 붙여 전달한다. */
    private static SignalMessage forward(SignalMessage message, String from) {
        Map<String, Object> fields = new HashMap<>(message.fields());
        fields.remove("to");
        fields.remove("from");
        if (from != null) {
            fields.put("from", from);
        }
        return new SignalMessage(message.type(), fields);
    }

    private void sendViewerCount(long broadcastId) {
        rooms.broadcasterOf(broadcastId).ifPresent(b -> b.send(SignalMessage.of(
                SignalMessage.VIEWER_COUNT, "count", rooms.viewerCount(broadcastId), "max", rooms.capacity())));
    }

    private JoinResult reject(Peer peer, JoinResult result) {
        JoinResult.Rejection rejection = result == null ? JoinResult.Rejection.NOT_FOUND : result.rejection();
        peer.send(SignalMessage.of(SignalMessage.REJECTED, "reason", rejection.reason()));
        peer.close();
        return JoinResult.rejected(rejection);
    }

    /** 방송이 있고 방송 중이어야 한다는 공통 조건을 먼저 검사하고, 통과하면 나머지 조건을 검사한다. */
    private JoinResult checkOnAir(long broadcastId, Function<LiveBroadcast, JoinResult.Rejection> rest) {
        LiveBroadcast live = repository.findLiveById(broadcastId).orElse(null);
        if (live == null) {
            return JoinResult.rejected(JoinResult.Rejection.NOT_FOUND);
        }
        if (!live.isOnAir()) {
            return JoinResult.rejected(JoinResult.Rejection.ENDED);
        }
        JoinResult.Rejection rejection = rest.apply(live);
        return rejection == null ? JoinResult.accepted() : JoinResult.rejected(rejection);
    }

    private JoinResult checkViewer(long broadcastId, Peer peer) {
        return checkOnAir(broadcastId, live -> {
            if (!rooms.hasBroadcaster(broadcastId)) {
                return JoinResult.Rejection.NOT_BROADCASTING;
            }
            if (rooms.isConnected(peer)) {
                return JoinResult.Rejection.ALREADY_JOINED;
            }
            return rooms.isFull(broadcastId) ? JoinResult.Rejection.FULL : null;
        });
    }

    private JoinResult check(long broadcastId, String streamKey, Peer peer) {
        return checkOnAir(broadcastId, live -> {
            if (!live.matchesStreamKey(streamKey)) {
                return JoinResult.Rejection.INVALID_KEY;
            }
            if (rooms.hasBroadcaster(broadcastId) || rooms.isConnected(peer)) {
                return JoinResult.Rejection.ALREADY_BROADCASTING;
            }
            return null;
        });
    }

    private void finish(long broadcastId) {
        transaction.executeWithoutResult(status ->
                repository.findLiveById(broadcastId).ifPresent(live -> live.end(clock.instant())));
        for (Peer viewer : rooms.closeRoom(broadcastId)) {
            viewer.send(SignalMessage.of(SignalMessage.ENDED));
            viewer.close();
        }
    }
}

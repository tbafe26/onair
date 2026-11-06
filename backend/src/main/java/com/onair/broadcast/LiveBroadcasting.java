package com.onair.broadcast;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.Clock;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * 라이브방송의 수명 주기를 맡는 깊은 모듈: 시작, 송출자 연결, 종료.
 * 라이브방송의 상태를 바꾸는 코드는 여기에만 있다. REST와 WebSocket은 이 모듈을 부르는 얇은 adapter다.
 *
 * <p>연결 표는 서버 메모리에 둔다(서버 한 대 전제). 표와 DB 변경은 같은 잠금 안에서 하고,
 * DB 반영이 끝난 뒤에 잠금을 놓아 다른 연결이 종료 전 상태를 읽지 못하게 한다.
 */
@Service
public class LiveBroadcasting {

    private final BroadcastRepository repository;
    private final MediaStorage storage;
    private final RegistrationRules rules;
    private final TransactionTemplate transaction;
    private final Clock clock = Clock.systemUTC();

    // 방송 id → 송출자 연결, 연결 → 방송 id. this 잠금으로 보호한다.
    private final Map<Long, Peer> broadcasters = new HashMap<>();
    private final Map<Peer, Long> broadcastIds = new IdentityHashMap<>();

    LiveBroadcasting(
            BroadcastRepository repository,
            MediaStorage storage,
            RegistrationRules rules,
            PlatformTransactionManager transactionManager) {
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
            String thumbnailKey = valid.thumbnail() == null ? null : store(batch, valid.thumbnail());
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
            JoinResult.Rejection rejection = result == null ? JoinResult.Rejection.NOT_FOUND : result.rejection();
            peer.send(SignalMessage.of(SignalMessage.REJECTED, "reason", rejection.reason()));
            peer.close();
            return JoinResult.rejected(rejection);
        }
        broadcasters.put(broadcastId, peer);
        broadcastIds.put(peer, broadcastId);
        peer.send(SignalMessage.of(SignalMessage.JOINED, "broadcastId", broadcastId));
        return result;
    }

    /** 송출자가 보낸 메시지를 처리한다. 지금은 end만 다룬다. 송출자가 아닌 연결의 메시지는 무시한다. */
    public synchronized void relay(Peer from, SignalMessage message) {
        Long broadcastId = broadcastIds.get(from);
        if (broadcastId == null) {
            return;
        }
        if (SignalMessage.END.equals(message.type())) {
            finish(broadcastId);
            from.send(SignalMessage.of(SignalMessage.ENDED));
            from.close();
        }
    }

    /** 연결이 끊겼다. 송출자였다면 방송을 종료로 저장한다. */
    public synchronized void leave(Peer peer) {
        Long broadcastId = broadcastIds.get(peer);
        if (broadcastId != null) {
            finish(broadcastId);
        }
    }

    private JoinResult check(long broadcastId, String streamKey, Peer peer) {
        LiveBroadcast live = repository.findLiveById(broadcastId).orElse(null);
        if (live == null) {
            return JoinResult.rejected(JoinResult.Rejection.NOT_FOUND);
        }
        if (!live.isOnAir()) {
            return JoinResult.rejected(JoinResult.Rejection.ENDED);
        }
        if (!live.matchesStreamKey(streamKey)) {
            return JoinResult.rejected(JoinResult.Rejection.INVALID_KEY);
        }
        if (broadcasters.containsKey(broadcastId) || broadcastIds.containsKey(peer)) {
            return JoinResult.rejected(JoinResult.Rejection.ALREADY_BROADCASTING);
        }
        return JoinResult.accepted();
    }

    private void finish(long broadcastId) {
        transaction.executeWithoutResult(status ->
                repository.findLiveById(broadcastId).ifPresent(live -> live.end(clock.instant())));
        Peer peer = broadcasters.remove(broadcastId);
        if (peer != null) {
            broadcastIds.remove(peer);
        }
    }

    private static String store(MediaStorage.Batch batch, MultipartFile file) {
        try (InputStream in = MultipartInputs.open(file)) {
            return batch.store(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}

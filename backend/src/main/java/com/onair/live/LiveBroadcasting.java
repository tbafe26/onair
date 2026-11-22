package com.onair.live;

import com.onair.api.Requester;
import com.onair.auth.AppUser;
import com.onair.auth.AppUserRepository;
import com.onair.broadcast.Broadcast;
import com.onair.broadcast.BroadcastRepository;
import com.onair.broadcast.LiveBroadcast;
import com.onair.broadcast.OwnedBroadcasts;
import com.onair.broadcast.RegistrationRules;
import com.onair.broadcast.StartLiveCommand;
import com.onair.broadcast.StreamKeys;
import com.onair.media.MediaStorage;
import com.onair.media.MultipartInputs;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 라이브방송의 수명 주기를 맡는 깊은 모듈: 시작, 송출 허용, 미디어 서버와 상태 맞추기, 종료.
 * 라이브방송의 상태를 바꾸는 코드는 여기에만 있다. REST와 주기 작업은 이 모듈을 부르는 얇은 adapter다.
 */
@Service
public class LiveBroadcasting {

    private final BroadcastRepository repository;
    private final MediaStorage storage;
    private final RegistrationRules rules;
    private final AppUserRepository users;
    private final TransactionTemplate transaction;
    private final Clock clock;
    private final LiveChat chat;
    private final MediaServer media;
    // 이 서버가 미디어 서버에서 송출을 못 본 첫 시각. 서버마다 따로 세고, 종료는 DB 잠금으로 한 번만 반영된다.
    private final Map<Long, Instant> missingSince = new HashMap<>();

    private static final Logger log = LoggerFactory.getLogger(LiveBroadcasting.class);

    /** 미디어 서버에 송출이 보이지 않은 채 이 시간이 지나면 송출자가 사라진 것으로 본다. */
    public static final Duration PUBLISH_GRACE = Duration.ofSeconds(30);

    LiveBroadcasting(
            BroadcastRepository repository,
            MediaStorage storage,
            RegistrationRules rules,
            AppUserRepository users,
            PlatformTransactionManager transactionManager,
            Clock clock,
            LiveChat chat,
            MediaServer media) {
        this.repository = repository;
        this.storage = storage;
        this.rules = rules;
        this.users = users;
        this.transaction = new TransactionTemplate(transactionManager);
        this.clock = clock;
        this.chat = chat;
        this.media = media;
    }

    /**
     * 로그인을 확인하고 입력을 검사한 뒤 방송 중인 라이브방송을 저장하고 송출 키를 발급한다. 키 원문은 여기서 돌려주는 값에만 있다.
     * userId는 요청한 사용자이고 로그인하지 않았으면 null이다. 이 사용자가 방송의 소유자가 된다.
     */
    public StartedLive start(StartLiveCommand command, Long userId) {
        AppUser owner = Requester.load(userId, users);
        StartLiveCommand valid = rules.validate(command);
        String streamKey = StreamKeys.generate();

        try (MediaStorage.Batch batch = storage.begin()) {
            String thumbnailKey = valid.thumbnail() == null
                    ? null : MultipartInputs.store(batch, valid.thumbnail());
            LiveBroadcast saved = repository.save(new LiveBroadcast(
                    valid.title(), StreamKeys.hash(streamKey), thumbnailKey, clock.instant(), owner));
            batch.commit();
            return new StartedLive(saved.getId(), streamKey);
        }
    }

    /**
     * 미디어 서버의 송출 목록(publishing)과 DB의 방송 중 라이브방송을 맞춘다. 송출이 보이지 않은 채
     * 30초가 지난 방송을 종료하고, 이 호출이 종료한 방송의 id를 돌려준다. 다시 보이면 유예를 처음부터 센다.
     * 유예는 이 서버가 처음 못 본 시각부터 세므로 새로 뜬 서버도 송출 중인 방송을 바로 끄지 않는다.
     * 방송 중이 아닌데 송출이 남아 있으면(종료 때 끊지 못함) 끊는다.
     */
    public List<Long> reconcile(Set<Long> publishing, Instant now) {
        Reconciled result = reconcileState(publishing, now);
        result.orphans().forEach(this::disconnectPublisher);
        return result.ended();
    }

    private record Reconciled(List<Long> ended, List<Long> orphans) {
    }

    // 미디어 서버 호출은 잠금 밖에서 한다. 응답이 늦어도 다른 종료 요청을 막지 않는다.
    private synchronized Reconciled reconcileState(Set<Long> publishing, Instant now) {
        List<LiveBroadcast> onAir = transaction.execute(status -> repository.findOnAirLives());
        if (onAir == null) {
            return new Reconciled(List.of(), List.of());
        }
        Set<Long> onAirIds = new HashSet<>();
        List<Long> expired = new ArrayList<>();
        for (LiveBroadcast live : onAir) {
            long id = live.getId();
            onAirIds.add(id);
            if (publishing.contains(id)) {
                missingSince.remove(id);
                continue;
            }
            Instant since = missingSince.computeIfAbsent(id, key -> now);
            if (now.isAfter(since.plus(PUBLISH_GRACE))) {
                expired.add(id);
            }
        }
        missingSince.keySet().retainAll(onAirIds);
        List<Long> ended = new ArrayList<>();
        for (long id : expired) {
            missingSince.remove(id);
            if (finish(id)) {
                ended.add(id);
            }
        }
        List<Long> orphans = publishing.stream().filter(id -> !onAirIds.contains(id)).toList();
        return new Reconciled(ended, orphans);
    }

    /** 미디어 서버가 송출을 받기 전에 묻는다. 방송 중인 라이브방송에 그 방송의 송출 키로 보낼 때만 true다. */
    public boolean acceptsPublish(long broadcastId, String streamKey) {
        return Boolean.TRUE.equals(transaction.execute(status -> repository.findById(broadcastId)
                .filter(LiveBroadcast.class::isInstance)
                .map(LiveBroadcast.class::cast)
                .map(live -> live.isOnAir() && live.matchesStreamKey(streamKey))
                .orElse(false)));
    }

    /**
     * 소유자의 요청으로 방송 중인 라이브방송을 종료한다. 로그인(401), 방송 존재(404), 소유자(403), 라이브방송(409) 순으로 확인한다.
     * 이미 종료됐으면 아무 일도 하지 않는다. 종료하면 모든 서버의 채팅 구독자에게 알리고 미디어 서버의 송출을 끊는다.
     * userId는 요청한 사용자이고 로그인하지 않았으면 null이다.
     */
    public void endByOwner(long broadcastId, Long userId) {
        if (endOnAirByOwner(broadcastId, userId)) {
            disconnectPublisher(broadcastId);
        }
    }

    private synchronized boolean endOnAirByOwner(long broadcastId, Long userId) {
        Boolean onAir = transaction.execute(status -> {
            Broadcast broadcast = OwnedBroadcasts.find(repository, broadcastId, userId);
            if (!broadcast.canEndStream()) {
                throw new NotLiveBroadcastException(broadcastId);
            }
            return broadcast.isOnAir();
        });
        if (!Boolean.TRUE.equals(onAir)) {
            return false;
        }
        finish(broadcastId);
        return true;
    }

    /** 송출 화면은 송출이 끊긴 것을 보고 종료를 안다. 끊지 못하면 다음 상태 맞추기가 다시 끊는다. */
    private void disconnectPublisher(long broadcastId) {
        try {
            media.disconnect(broadcastId);
        } catch (MediaServerUnavailableException e) {
            log.warn("방송 {}의 송출을 끊지 못했습니다: {}", broadcastId, e.getMessage());
        }
    }

    /**
     * 방송 중일 때만 종료로 바꾸고 모든 서버에 알린다. 여러 서버가 동시에 불러도 행 잠금 뒤 상태를 다시 보므로
     * 한 번만 반영되고, 그때만 true다.
     */
    private boolean finish(long broadcastId) {
        return Boolean.TRUE.equals(transaction.execute(status ->
                repository.findLiveByIdForUpdate(broadcastId)
                        .filter(live -> live.end(clock.instant()))
                        .map(live -> {
                            chat.close(broadcastId);
                            return true;
                        })
                        .orElse(false)));
    }
}

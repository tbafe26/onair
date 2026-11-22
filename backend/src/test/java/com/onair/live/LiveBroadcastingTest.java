package com.onair.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.onair.api.AuthenticationRequiredException;
import com.onair.api.InvalidRequestException;
import com.onair.auth.AppUserRepository;
import com.onair.broadcast.LiveBroadcast;
import com.onair.broadcast.LiveStatus;
import com.onair.broadcast.RegistrationRules;
import com.onair.broadcast.StartLiveCommand;
import com.onair.broadcast.StreamKeys;
import com.onair.media.MediaStorage;
import com.onair.support.ApiTestSupport;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;

/** 라이브방송 모듈을 interface(start, reconcile, acceptsPublish, endByOwner)로만 검증한다. 시각은 테스트가 넘긴다. */
class LiveBroadcastingTest extends ApiTestSupport {

    @Autowired
    LiveBroadcasting live;

    @Autowired
    MediaStorage storage;

    @Autowired
    RegistrationRules rules;

    @Autowired
    AppUserRepository users;

    @Autowired
    PlatformTransactionManager transactionManager;

    @Autowired
    LiveChat chat;

    LiveBroadcasting 미디어_서버를_넣은_모듈(MediaServer media) {
        return new LiveBroadcasting(repository, storage, rules, users, transactionManager, clock, chat, media);
    }

    /** 같은 DB를 쓰는 다른 서버. 상태 맞추기 기억은 서버마다 따로다. */
    LiveBroadcasting 다른_서버() {
        return 미디어_서버를_넣은_모듈(new FakeMediaServer());
    }

    StartedLive 시작한다(String title) {
        return live.start(new StartLiveCommand(title, null), owner().userId());
    }

    LiveBroadcast 저장된_방송(StartedLive started) {
        return repository.findLiveById(started.broadcastId()).orElseThrow();
    }

    @Test
    void 로그인하지_않은_시작은_거절되고_저장하지_않는다() {
        assertThatThrownBy(() -> live.start(new StartLiveCommand("몰래", null), null))
                .isInstanceOf(AuthenticationRequiredException.class);

        assertThat(repository.count()).isZero();
    }

    @Test
    void 시작한_사용자가_소유자로_저장된다() {
        StartedLive started = 시작한다("내 방송");

        assertThat(저장된_방송(started).getOwner().getId()).isEqualTo(owner().userId());
    }

    @Test
    void 시작하면_방송_중으로_저장되고_송출_키를_돌려준다() {
        StartedLive started = 시작한다("  첫 라이브  ");

        LiveBroadcast saved = 저장된_방송(started);
        assertThat(saved.getTitle()).isEqualTo("첫 라이브");
        assertThat(saved.status()).isEqualTo(LiveStatus.ON_AIR);
        assertThat(saved.endedAt()).isNull();
        assertThat(started.streamKey()).hasSizeGreaterThanOrEqualTo(40);
    }

    @Test
    void 저장된_값은_송출_키_원문이_아니라_해시다() {
        StartedLive started = 시작한다("해시 확인");

        String stored = jdbc.queryForObject("select stream_key_hash from live_broadcast", String.class);
        assertThat(stored).isNotEqualTo(started.streamKey()).doesNotContain(started.streamKey());
        assertThat(stored).isEqualTo(StreamKeys.hash(started.streamKey()));
    }

    @Test
    void 시작할_때마다_다른_송출_키를_발급한다() {
        assertThat(시작한다("하나").streamKey()).isNotEqualTo(시작한다("둘").streamKey());
    }

    @Test
    void 제목이_비었으면_시작되지_않는다() {
        assertThatThrownBy(() -> 시작한다("   ")).isInstanceOf(InvalidRequestException.class);
        assertThat(repository.count()).isZero();
    }

    // --- 미디어 서버와 상태 맞추기 ---

    @Test
    void 미디어_서버에_송출이_없는_방송은_30초_유예_뒤_종료된다() {
        StartedLive started = 시작한다("송출 끊김");
        long id = started.broadcastId();
        Instant firstSeen = clock.instant();

        assertThat(live.reconcile(Set.of(), firstSeen)).isEmpty();
        assertThat(live.reconcile(Set.of(), firstSeen.plusSeconds(30))).isEmpty();
        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ON_AIR);

        assertThat(live.reconcile(Set.of(), firstSeen.plusSeconds(31))).containsExactly(id);
        LiveBroadcast saved = 저장된_방송(started);
        assertThat(saved.status()).isEqualTo(LiveStatus.ENDED);
        assertThat(saved.endedAt()).isNotNull();
    }

    @Test
    void 송출이_다시_보이면_유예가_처음부터_다시_시작한다() {
        StartedLive started = 시작한다("잠깐 끊김");
        long id = started.broadcastId();
        Instant t0 = clock.instant();

        live.reconcile(Set.of(), t0);
        live.reconcile(Set.of(id), t0.plusSeconds(20));
        live.reconcile(Set.of(), t0.plusSeconds(25));
        live.reconcile(Set.of(), t0.plusSeconds(55));
        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ON_AIR);

        live.reconcile(Set.of(), t0.plusSeconds(56));
        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ENDED);
    }

    @Test
    void 송출_중인_방송은_얼마가_지나도_유지된다() {
        StartedLive started = 시작한다("계속 송출");
        Instant t0 = clock.instant();

        live.reconcile(Set.of(started.broadcastId()), t0);
        live.reconcile(Set.of(started.broadcastId()), t0.plusSeconds(600));

        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ON_AIR);
    }

    @Test
    void 새로_뜬_서버도_송출_중인_방송을_종료하지_않고_처음_본_때부터_유예를_센다() {
        StartedLive started = 시작한다("서버가 늘어남");
        Instant t0 = clock.instant().plusSeconds(300);
        LiveBroadcasting secondServer = 다른_서버();

        secondServer.reconcile(Set.of(started.broadcastId()), t0);
        secondServer.reconcile(Set.of(), t0.plusSeconds(5));
        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ON_AIR);

        secondServer.reconcile(Set.of(), t0.plusSeconds(36));
        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ENDED);
    }

    @Test
    void 두_서버가_동시에_맞춰도_종료는_한_번만_반영된다() throws Exception {
        StartedLive started = 시작한다("동시 정리");
        Instant t0 = clock.instant();
        LiveBroadcasting secondServer = 다른_서버();
        live.reconcile(Set.of(), t0);
        secondServer.reconcile(Set.of(), t0);

        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            CountDownLatch go = new CountDownLatch(1);
            Future<List<Long>> first = pool.submit(() -> {
                go.await();
                return live.reconcile(Set.of(), t0.plusSeconds(31));
            });
            Future<List<Long>> second = pool.submit(() -> {
                go.await();
                return secondServer.reconcile(Set.of(), t0.plusSeconds(32));
            });
            go.countDown();
            List<Long> ended = new ArrayList<>(first.get());
            ended.addAll(second.get());

            assertThat(ended).containsExactly(started.broadcastId());
        }
        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ENDED);
    }

    @Test
    void 이미_종료된_방송은_상태_맞추기로_종료_시각이_바뀌지_않는다() {
        StartedLive started = 시작한다("이미 종료");
        live.endByOwner(started.broadcastId(), owner().userId());
        Instant endedAt = 저장된_방송(started).endedAt();

        live.reconcile(Set.of(), clock.instant().plusSeconds(1));
        live.reconcile(Set.of(), clock.instant().plusSeconds(120));

        assertThat(저장된_방송(started).endedAt()).isEqualTo(endedAt);
    }

    @Test
    void 주기_작업은_미디어_서버의_송출_목록과_현재_시각으로_맞추고_목록을_못_읽으면_아무것도_종료하지_않는다() {
        StartedLive publishing = 시작한다("송출 중");
        StartedLive silent = 시작한다("송출 없음");
        FakeMediaServer media = new FakeMediaServer();
        media.publishing.add(publishing.broadcastId());
        LiveBroadcastMaintenance maintenance = new LiveBroadcastMaintenance(live, media, clock);

        maintenance.reconcileWithMediaServer();
        media.unavailable = true;
        clock.set(clock.instant().plusSeconds(60));
        maintenance.reconcileWithMediaServer();
        assertThat(저장된_방송(silent).status()).isEqualTo(LiveStatus.ON_AIR);

        media.unavailable = false;
        maintenance.reconcileWithMediaServer();
        assertThat(저장된_방송(silent).status()).isEqualTo(LiveStatus.ENDED);
        assertThat(저장된_방송(publishing).status()).isEqualTo(LiveStatus.ON_AIR);
    }

    @Test
    void 소유자가_종료하면_미디어_서버의_송출도_끊는다() {
        FakeMediaServer media = new FakeMediaServer();
        LiveBroadcasting module = 미디어_서버를_넣은_모듈(media);
        StartedLive started = module.start(new StartLiveCommand("끊기", null), owner().userId());

        module.endByOwner(started.broadcastId(), owner().userId());

        assertThat(media.disconnected).containsExactly(started.broadcastId());
    }

    @Test
    void 종료된_방송의_송출이_미디어_서버에_남아_있으면_상태_맞추기가_끊는다() {
        FakeMediaServer media = new FakeMediaServer();
        LiveBroadcasting module = 미디어_서버를_넣은_모듈(media);
        StartedLive ended = module.start(new StartLiveCommand("끊지 못한 송출", null), owner().userId());
        StartedLive onAir = module.start(new StartLiveCommand("계속 송출", null), owner().userId());
        media.unavailable = true;
        module.endByOwner(ended.broadcastId(), owner().userId());
        media.unavailable = false;

        module.reconcile(Set.of(ended.broadcastId(), onAir.broadcastId()), clock.instant());

        assertThat(media.disconnected).containsExactly(ended.broadcastId());
    }

    @Test
    void 미디어_서버가_응답하지_않아도_소유자_종료는_저장된다() {
        FakeMediaServer media = new FakeMediaServer();
        media.unavailable = true;
        LiveBroadcasting module = 미디어_서버를_넣은_모듈(media);
        StartedLive started = module.start(new StartLiveCommand("응답 없음", null), owner().userId());

        module.endByOwner(started.broadcastId(), owner().userId());

        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ENDED);
    }

    @Test
    void 소유자가_REST로_종료하면_종료로_저장되고_다시_송출할_수_없다() {
        StartedLive started = 시작한다("REST 종료");

        live.endByOwner(started.broadcastId(), owner().userId());

        LiveBroadcast saved = 저장된_방송(started);
        assertThat(saved.status()).isEqualTo(LiveStatus.ENDED);
        assertThat(saved.endedAt()).isNotNull();
        assertThat(live.acceptsPublish(started.broadcastId(), started.streamKey())).isFalse();
    }

    @Test
    void 이미_종료된_방송의_REST_종료는_종료_시각을_바꾸지_않는다() {
        StartedLive started = 시작한다("이미 종료");
        live.endByOwner(started.broadcastId(), owner().userId());
        Instant endedAt = 저장된_방송(started).endedAt();
        clock.set(clock.instant().plusSeconds(60));

        live.endByOwner(started.broadcastId(), owner().userId());

        assertThat(저장된_방송(started).endedAt()).isEqualTo(endedAt);
    }
}

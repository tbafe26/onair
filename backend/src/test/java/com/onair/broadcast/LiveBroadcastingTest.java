package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.onair.auth.AppUserRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;

/** 송출 모듈을 interface(start, joinAsBroadcaster, relay, leave)로만 검증한다. 상대는 기록용 Peer다. */
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

    LiveBroadcasting 상한이_있는_모듈(int maxViewers) {
        return new LiveBroadcasting(repository, storage, rules, users, transactionManager, clock, maxViewers);
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

    @Test
    void 올바른_키로_송출자가_연결된다() {
        StartedLive started = 시작한다("연결");
        RecordingPeer broadcaster = new RecordingPeer();

        JoinResult result = live.joinAsBroadcaster(started.broadcastId(), started.streamKey(), broadcaster);

        assertThat(result.isAccepted()).isTrue();
        assertThat(broadcaster.types()).containsExactly("joined");
        assertThat(broadcaster.closed).isFalse();
    }

    @Test
    void 키가_다르면_invalid_key로_거절되고_연결이_닫힌다() {
        StartedLive started = 시작한다("키 불일치");
        RecordingPeer intruder = new RecordingPeer();

        JoinResult result = live.joinAsBroadcaster(started.broadcastId(), "wrong-key", intruder);

        assertThat(result.rejection()).isEqualTo(JoinResult.Rejection.INVALID_KEY);
        assertThat(intruder.last().type()).isEqualTo("rejected");
        assertThat(intruder.last().text("reason")).isEqualTo("invalid-key");
        assertThat(intruder.closed).isTrue();
        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ON_AIR);
    }

    @Test
    void 키를_보내지_않아도_invalid_key로_거절된다() {
        StartedLive started = 시작한다("키 없음");

        JoinResult result = live.joinAsBroadcaster(started.broadcastId(), null, new RecordingPeer());

        assertThat(result.rejection()).isEqualTo(JoinResult.Rejection.INVALID_KEY);
    }

    @Test
    void 이미_송출자가_있으면_올바른_키여도_already_broadcasting으로_거절된다() {
        StartedLive started = 시작한다("중복 송출");
        RecordingPeer first = new RecordingPeer();
        RecordingPeer second = new RecordingPeer();
        live.joinAsBroadcaster(started.broadcastId(), started.streamKey(), first);

        JoinResult result = live.joinAsBroadcaster(started.broadcastId(), started.streamKey(), second);

        assertThat(result.rejection()).isEqualTo(JoinResult.Rejection.ALREADY_BROADCASTING);
        assertThat(second.last().text("reason")).isEqualTo("already-broadcasting");
        assertThat(first.closed).isFalse();
    }

    @Test
    void 없는_방송은_not_found로_거절된다() {
        RecordingPeer peer = new RecordingPeer();

        JoinResult result = live.joinAsBroadcaster(9999, "key", peer);

        assertThat(result.rejection()).isEqualTo(JoinResult.Rejection.NOT_FOUND);
        assertThat(peer.last().text("reason")).isEqualTo("not-found");
        assertThat(peer.closed).isTrue();
    }

    @Test
    void end_메시지를_보내면_종료로_저장되고_송출자에게_ended가_간다() {
        StartedLive started = 시작한다("종료");
        RecordingPeer broadcaster = new RecordingPeer();
        live.joinAsBroadcaster(started.broadcastId(), started.streamKey(), broadcaster);

        live.relay(broadcaster, SignalMessage.of("end"));

        LiveBroadcast saved = 저장된_방송(started);
        assertThat(saved.status()).isEqualTo(LiveStatus.ENDED);
        assertThat(saved.endedAt()).isNotNull();
        assertThat(broadcaster.last().type()).isEqualTo("ended");
        assertThat(broadcaster.closed).isTrue();
    }

    @Test
    void 송출자_연결이_끊기면_종료로_저장된다() {
        StartedLive started = 시작한다("끊김");
        RecordingPeer broadcaster = new RecordingPeer();
        live.joinAsBroadcaster(started.broadcastId(), started.streamKey(), broadcaster);

        live.leave(broadcaster);

        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ENDED);
    }

    @Test
    void 송출자가_아닌_연결의_end와_연결_끊김은_방송에_영향이_없다() {
        StartedLive started = 시작한다("다른 연결");
        RecordingPeer broadcaster = new RecordingPeer();
        RecordingPeer stranger = new RecordingPeer();
        live.joinAsBroadcaster(started.broadcastId(), started.streamKey(), broadcaster);

        live.relay(stranger, SignalMessage.of("end"));
        live.leave(stranger);

        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ON_AIR);
        assertThat(stranger.received).isEmpty();
    }

    @Test
    void 종료된_방송에는_올바른_키로도_다시_연결할_수_없고_방송_중이_되지_않는다() {
        StartedLive started = 시작한다("재시작 불가");
        RecordingPeer first = new RecordingPeer();
        live.joinAsBroadcaster(started.broadcastId(), started.streamKey(), first);
        live.relay(first, SignalMessage.of("end"));
        RecordingPeer again = new RecordingPeer();

        JoinResult result = live.joinAsBroadcaster(started.broadcastId(), started.streamKey(), again);

        assertThat(result.rejection()).isEqualTo(JoinResult.Rejection.ENDED);
        assertThat(again.last().text("reason")).isEqualTo("ended");
        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ENDED);
    }

    @Test
    void 종료된_뒤에_보낸_end는_종료_시각을_바꾸지_않는다() {
        StartedLive started = 시작한다("한 번만 종료");
        RecordingPeer broadcaster = new RecordingPeer();
        live.joinAsBroadcaster(started.broadcastId(), started.streamKey(), broadcaster);
        live.relay(broadcaster, SignalMessage.of("end"));
        var endedAt = 저장된_방송(started).endedAt();

        live.relay(broadcaster, SignalMessage.of("end"));
        live.leave(broadcaster);

        assertThat(저장된_방송(started).endedAt()).isEqualTo(endedAt);
    }

    // --- 시청자 ---

    record OnAir(StartedLive started, RecordingPeer broadcaster) { }

    OnAir 송출을_시작한다(String title) {
        StartedLive started = 시작한다(title);
        RecordingPeer broadcaster = new RecordingPeer();
        live.joinAsBroadcaster(started.broadcastId(), started.streamKey(), broadcaster);
        broadcaster.received.clear();
        return new OnAir(started, broadcaster);
    }

    String 입장한다(OnAir onAir, RecordingPeer viewer) {
        live.joinAsViewer(onAir.started().broadcastId(), viewer);
        return viewer.last().text("viewerId");
    }

    @Test
    void 시청자가_입장하면_번호를_받고_송출자에게_입장과_시청자_수가_간다() {
        OnAir onAir = 송출을_시작한다("시청자 입장");
        RecordingPeer viewer = new RecordingPeer();

        JoinResult result = live.joinAsViewer(onAir.started().broadcastId(), viewer);

        assertThat(result.isAccepted()).isTrue();
        assertThat(viewer.types()).containsExactly("joined");
        String viewerId = viewer.last().text("viewerId");
        assertThat(viewerId).isNotBlank();
        assertThat(onAir.broadcaster().types()).containsExactly("viewer-joined", "viewer-count");
        assertThat(onAir.broadcaster().received.getFirst().text("viewerId")).isEqualTo(viewerId);
        assertThat(onAir.broadcaster().last().fields()).containsEntry("count", 1);
    }

    @Test
    void 시청자마다_다른_번호를_받는다() {
        OnAir onAir = 송출을_시작한다("번호");

        String first = 입장한다(onAir, new RecordingPeer());
        String second = 입장한다(onAir, new RecordingPeer());

        assertThat(first).isNotEqualTo(second);
        assertThat(onAir.broadcaster().last().fields()).containsEntry("count", 2);
    }

    @Test
    void 없는_방송과_종료된_방송에는_시청자로_연결할_수_없다() {
        RecordingPeer missing = new RecordingPeer();
        assertThat(live.joinAsViewer(9999, missing).rejection()).isEqualTo(JoinResult.Rejection.NOT_FOUND);
        assertThat(missing.last().text("reason")).isEqualTo("not-found");
        assertThat(missing.closed).isTrue();

        OnAir onAir = 송출을_시작한다("종료됨");
        live.relay(onAir.broadcaster(), SignalMessage.of("end"));
        RecordingPeer late = new RecordingPeer();
        assertThat(live.joinAsViewer(onAir.started().broadcastId(), late).rejection())
                .isEqualTo(JoinResult.Rejection.ENDED);
        assertThat(late.last().text("reason")).isEqualTo("ended");
        assertThat(late.closed).isTrue();
    }

    @Test
    void 송출자가_아직_연결되지_않은_방송은_not_broadcasting으로_거절된다() {
        StartedLive started = 시작한다("송출자 없음");
        RecordingPeer viewer = new RecordingPeer();

        JoinResult result = live.joinAsViewer(started.broadcastId(), viewer);

        assertThat(result.rejection()).isEqualTo(JoinResult.Rejection.NOT_BROADCASTING);
        assertThat(viewer.closed).isTrue();
    }

    @Test
    void 송출자의_offer는_to로_지정한_시청자에게만_간다() {
        OnAir onAir = 송출을_시작한다("지정 전달");
        RecordingPeer target = new RecordingPeer();
        RecordingPeer other = new RecordingPeer();
        String targetId = 입장한다(onAir, target);
        입장한다(onAir, other);
        target.received.clear();
        other.received.clear();

        live.relay(onAir.broadcaster(), new SignalMessage("offer", Map.of("to", targetId, "sdp", "v=0")));

        assertThat(target.types()).containsExactly("offer");
        assertThat(target.last().text("sdp")).isEqualTo("v=0");
        assertThat(target.last().text("to")).isNull();
        assertThat(other.received).isEmpty();
    }

    @Test
    void 시청자의_answer와_candidate는_송출자에게만_가고_보낸_사람은_서버가_정한다() {
        OnAir onAir = 송출을_시작한다("시청자 응답");
        RecordingPeer viewer = new RecordingPeer();
        RecordingPeer other = new RecordingPeer();
        String viewerId = 입장한다(onAir, viewer);
        입장한다(onAir, other);
        onAir.broadcaster().received.clear();
        other.received.clear();

        // 시청자가 from을 위조해도 서버가 부여한 시청자 번호로 덮어쓴다.
        live.relay(viewer, new SignalMessage("answer", Map.of("sdp", "a", "from", "999", "to", "x")));
        live.relay(viewer, new SignalMessage("candidate", Map.of("candidate", "c")));

        assertThat(onAir.broadcaster().types()).containsExactly("answer", "candidate");
        assertThat(onAir.broadcaster().received.getFirst().text("from")).isEqualTo(viewerId);
        assertThat(onAir.broadcaster().received.getFirst().text("to")).isNull();
        assertThat(onAir.broadcaster().last().text("from")).isEqualTo(viewerId);
        assertThat(other.received).isEmpty();
    }

    @Test
    void 없는_시청자를_가리키거나_알_수_없는_종류의_메시지는_무시한다() {
        OnAir onAir = 송출을_시작한다("무시");
        RecordingPeer viewer = new RecordingPeer();
        입장한다(onAir, viewer);
        viewer.received.clear();
        onAir.broadcaster().received.clear();

        live.relay(onAir.broadcaster(), new SignalMessage("offer", Map.of("to", "nobody")));
        live.relay(onAir.broadcaster(), new SignalMessage("offer", Map.of()));
        live.relay(viewer, SignalMessage.of("end"));
        live.relay(viewer, SignalMessage.of("whatever"));

        assertThat(viewer.received).isEmpty();
        assertThat(onAir.broadcaster().received).isEmpty();
        assertThat(저장된_방송(onAir.started()).status()).isEqualTo(LiveStatus.ON_AIR);
    }

    @Test
    void 시청자가_나가면_송출자에게_퇴장과_줄어든_시청자_수가_가고_다른_시청자는_그대로다() {
        OnAir onAir = 송출을_시작한다("시청자 퇴장");
        RecordingPeer leaving = new RecordingPeer();
        RecordingPeer staying = new RecordingPeer();
        String leavingId = 입장한다(onAir, leaving);
        입장한다(onAir, staying);
        onAir.broadcaster().received.clear();
        staying.received.clear();

        live.leave(leaving);

        assertThat(onAir.broadcaster().types()).containsExactly("viewer-left", "viewer-count");
        assertThat(onAir.broadcaster().received.getFirst().text("viewerId")).isEqualTo(leavingId);
        assertThat(onAir.broadcaster().last().fields()).containsEntry("count", 1);
        assertThat(staying.received).isEmpty();
        assertThat(staying.closed).isFalse();
        assertThat(저장된_방송(onAir.started()).status()).isEqualTo(LiveStatus.ON_AIR);
    }

    @Test
    void 같은_연결이_두_번_입장해도_자리는_하나다() {
        OnAir onAir = 송출을_시작한다("중복 입장");
        RecordingPeer viewer = new RecordingPeer();
        입장한다(onAir, viewer);

        JoinResult again = live.joinAsViewer(onAir.started().broadcastId(), viewer);

        assertThat(again.rejection()).isEqualTo(JoinResult.Rejection.ALREADY_JOINED);
        assertThat(onAir.broadcaster().last().fields()).containsEntry("count", 1);
    }

    @Test
    void 시청자_수가_상한까지는_입장하고_시청자_수에_상한이_함께_간다() {
        OnAir onAir = 송출을_시작한다("상한까지");

        for (int i = 0; i < 5; i++) {
            assertThat(live.joinAsViewer(onAir.started().broadcastId(), new RecordingPeer()).isAccepted()).isTrue();
        }

        assertThat(onAir.broadcaster().last().fields()).containsEntry("count", 5).containsEntry("max", 5);
    }

    @Test
    void 상한을_넘는_입장은_full로_거절되고_기존_시청자는_영향이_없다() {
        OnAir onAir = 송출을_시작한다("상한 초과");
        List<RecordingPeer> viewers = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            RecordingPeer viewer = new RecordingPeer();
            입장한다(onAir, viewer);
            viewers.add(viewer);
        }
        onAir.broadcaster().received.clear();
        RecordingPeer late = new RecordingPeer();

        JoinResult result = live.joinAsViewer(onAir.started().broadcastId(), late);

        assertThat(result.rejection()).isEqualTo(JoinResult.Rejection.FULL);
        assertThat(late.types()).containsExactly("rejected");
        assertThat(late.last().text("reason")).isEqualTo("full");
        assertThat(late.closed).isTrue();
        assertThat(onAir.broadcaster().received).isEmpty();
        assertThat(viewers).allSatisfy(viewer -> assertThat(viewer.closed).isFalse());
    }

    @Test
    void 시청자가_나가면_자리가_나서_다시_입장할_수_있다() {
        OnAir onAir = 송출을_시작한다("퇴장 후 재입장");
        RecordingPeer first = new RecordingPeer();
        입장한다(onAir, first);
        for (int i = 0; i < 4; i++) {
            입장한다(onAir, new RecordingPeer());
        }
        assertThat(live.joinAsViewer(onAir.started().broadcastId(), new RecordingPeer()).rejection())
                .isEqualTo(JoinResult.Rejection.FULL);

        live.leave(first);
        JoinResult again = live.joinAsViewer(onAir.started().broadcastId(), new RecordingPeer());

        assertThat(again.isAccepted()).isTrue();
        assertThat(onAir.broadcaster().last().fields()).containsEntry("count", 5);
    }

    @Test
    void 설정한_상한이_적용된다() {
        LiveBroadcasting limited = 상한이_있는_모듈(2);
        StartedLive started = limited.start(new StartLiveCommand("상한 설정", null), owner().userId());
        RecordingPeer broadcaster = new RecordingPeer();
        limited.joinAsBroadcaster(started.broadcastId(), started.streamKey(), broadcaster);

        assertThat(limited.joinAsViewer(started.broadcastId(), new RecordingPeer()).isAccepted()).isTrue();
        assertThat(limited.joinAsViewer(started.broadcastId(), new RecordingPeer()).isAccepted()).isTrue();
        assertThat(limited.joinAsViewer(started.broadcastId(), new RecordingPeer()).rejection())
                .isEqualTo(JoinResult.Rejection.FULL);
        assertThat(broadcaster.last().fields()).containsEntry("count", 2).containsEntry("max", 2);
    }

    @Test
    void 송출자가_end를_보내면_모든_시청자에게_ended가_가고_연결이_닫힌다() {
        OnAir onAir = 송출을_시작한다("송출 종료");
        RecordingPeer first = new RecordingPeer();
        RecordingPeer second = new RecordingPeer();
        입장한다(onAir, first);
        입장한다(onAir, second);

        live.relay(onAir.broadcaster(), SignalMessage.of("end"));

        assertThat(first.last().type()).isEqualTo("ended");
        assertThat(second.last().type()).isEqualTo("ended");
        assertThat(first.closed).isTrue();
        assertThat(second.closed).isTrue();
    }

    @Test
    void 송출자_연결이_끊겨도_모든_시청자에게_ended가_가고_이후_시청자_퇴장은_송출자에게_알리지_않는다() {
        OnAir onAir = 송출을_시작한다("송출자 끊김");
        RecordingPeer viewer = new RecordingPeer();
        입장한다(onAir, viewer);
        onAir.broadcaster().received.clear();

        live.leave(onAir.broadcaster());
        live.leave(viewer);

        assertThat(viewer.last().type()).isEqualTo("ended");
        assertThat(viewer.closed).isTrue();
        assertThat(onAir.broadcaster().received).isEmpty();
    }

    // --- 생존 신호, 시간 초과, 서버 시작 정리 ---

    @Test
    void 연락이_30초를_넘기면_방송이_종료되고_송출자와_시청자에게_ended가_가고_연결이_닫힌다() {
        OnAir onAir = 송출을_시작한다("무응답");
        RecordingPeer viewer = new RecordingPeer();
        입장한다(onAir, viewer);
        Instant joinedAt = clock.instant();

        live.expireSilentBroadcasters(joinedAt.plusSeconds(31));

        LiveBroadcast saved = 저장된_방송(onAir.started());
        assertThat(saved.status()).isEqualTo(LiveStatus.ENDED);
        assertThat(saved.endedAt()).isNotNull();
        assertThat(onAir.broadcaster().last().type()).isEqualTo("ended");
        assertThat(onAir.broadcaster().closed).isTrue();
        assertThat(viewer.last().type()).isEqualTo("ended");
        assertThat(viewer.closed).isTrue();
    }

    @Test
    void 연락이_30초_안이면_종료되지_않는다() {
        OnAir onAir = 송출을_시작한다("아직 괜찮음");

        live.expireSilentBroadcasters(clock.instant().plusSeconds(29));

        assertThat(저장된_방송(onAir.started()).status()).isEqualTo(LiveStatus.ON_AIR);
        assertThat(onAir.broadcaster().received).isEmpty();
        assertThat(onAir.broadcaster().closed).isFalse();
    }

    @Test
    void heartbeat를_받을_때마다_30초가_새로_시작한다() {
        OnAir onAir = 송출을_시작한다("생존 신호");
        Instant joinedAt = clock.instant();

        clock.set(joinedAt.plusSeconds(20));
        live.relay(onAir.broadcaster(), SignalMessage.of("heartbeat"));
        live.expireSilentBroadcasters(joinedAt.plusSeconds(49));
        assertThat(저장된_방송(onAir.started()).status()).isEqualTo(LiveStatus.ON_AIR);

        live.expireSilentBroadcasters(joinedAt.plusSeconds(51));
        assertThat(저장된_방송(onAir.started()).status()).isEqualTo(LiveStatus.ENDED);
    }

    @Test
    void 송출자가_아닌_연결의_heartbeat는_생존_신호가_아니다() {
        OnAir onAir = 송출을_시작한다("남의 신호");
        Instant joinedAt = clock.instant();
        RecordingPeer viewer = new RecordingPeer();
        입장한다(onAir, viewer);
        RecordingPeer stranger = new RecordingPeer();

        clock.set(joinedAt.plusSeconds(25));
        live.relay(viewer, SignalMessage.of("heartbeat"));
        live.relay(stranger, SignalMessage.of("heartbeat"));
        live.expireSilentBroadcasters(joinedAt.plusSeconds(31));

        assertThat(저장된_방송(onAir.started()).status()).isEqualTo(LiveStatus.ENDED);
    }

    @Test
    void 송출자가_연결하지_않은_방송은_시작_시각부터_30초_뒤_종료된다() {
        StartedLive started = 시작한다("연결 못 함");
        Instant startedAt = 저장된_방송(started).getCreatedAt();

        live.expireSilentBroadcasters(startedAt.plusSeconds(29));
        assertThat(저장된_방송(started).status()).isEqualTo(LiveStatus.ON_AIR);

        live.expireSilentBroadcasters(startedAt.plusSeconds(31));
        LiveBroadcast saved = 저장된_방송(started);
        assertThat(saved.status()).isEqualTo(LiveStatus.ENDED);
        assertThat(saved.endedAt()).isNotNull();
    }

    @Test
    void 이미_종료된_방송은_시간_초과로_종료_시각이_바뀌지_않는다() {
        OnAir onAir = 송출을_시작한다("이미 종료");
        live.relay(onAir.broadcaster(), SignalMessage.of("end"));
        Instant endedAt = 저장된_방송(onAir.started()).endedAt();

        live.expireSilentBroadcasters(clock.instant().plusSeconds(120));

        assertThat(저장된_방송(onAir.started()).endedAt()).isEqualTo(endedAt);
    }

    @Test
    void 시간_초과로_종료된_방송에는_다시_연결할_수_없다() {
        OnAir onAir = 송출을_시작한다("다시 연결 불가");
        live.expireSilentBroadcasters(clock.instant().plusSeconds(31));
        RecordingPeer again = new RecordingPeer();

        JoinResult result = live.joinAsBroadcaster(onAir.started().broadcastId(), onAir.started().streamKey(), again);

        assertThat(result.rejection()).isEqualTo(JoinResult.Rejection.ENDED);
    }

    @Test
    void 시간_초과된_방송만_종료하고_연락이_이어진_방송은_그대로_둔다() {
        OnAir silent = 송출을_시작한다("조용한 방송");
        Instant joinedAt = clock.instant();
        clock.set(joinedAt.plusSeconds(20));
        OnAir alive = 송출을_시작한다("살아 있는 방송");

        live.expireSilentBroadcasters(joinedAt.plusSeconds(40));

        assertThat(저장된_방송(silent.started()).status()).isEqualTo(LiveStatus.ENDED);
        assertThat(저장된_방송(alive.started()).status()).isEqualTo(LiveStatus.ON_AIR);
    }

    @Test
    void 서버를_시작하면_방송_중으로_남은_라이브방송이_모두_종료된다() {
        StartedLive first = 시작한다("남은 방송 1");
        StartedLive second = 시작한다("남은 방송 2");
        clock.set(clock.instant().plusSeconds(5));

        live.endAllOnAir();

        for (StartedLive started : new StartedLive[] {first, second}) {
            LiveBroadcast saved = 저장된_방송(started);
            assertThat(saved.status()).isEqualTo(LiveStatus.ENDED);
            assertThat(saved.endedAt()).isEqualTo(clock.instant());
        }
    }

    @Test
    void 서버_시작_정리는_이미_끝난_방송의_종료_시각을_바꾸지_않는다() {
        OnAir onAir = 송출을_시작한다("먼저 종료");
        live.relay(onAir.broadcaster(), SignalMessage.of("end"));
        Instant endedAt = 저장된_방송(onAir.started()).endedAt();
        clock.set(clock.instant().plusSeconds(100));

        live.endAllOnAir();

        assertThat(저장된_방송(onAir.started()).endedAt()).isEqualTo(endedAt);
    }

    @Test
    void 주기_작업은_현재_시각으로_시간_초과를_검사하고_시작_때는_남은_방송을_종료한다() {
        StartedLive leftover = 시작한다("정리 대상");
        LiveBroadcastMaintenance maintenance = new LiveBroadcastMaintenance(live, clock);

        clock.set(clock.instant().plusSeconds(10));
        maintenance.expireSilentBroadcasters();
        assertThat(저장된_방송(leftover).status()).isEqualTo(LiveStatus.ON_AIR);

        clock.set(clock.instant().plusSeconds(25));
        maintenance.expireSilentBroadcasters();
        assertThat(저장된_방송(leftover).status()).isEqualTo(LiveStatus.ENDED);

        StartedLive another = 시작한다("서버 시작 때 남은 방송");
        maintenance.run(null);
        assertThat(저장된_방송(another).status()).isEqualTo(LiveStatus.ENDED);
    }
}

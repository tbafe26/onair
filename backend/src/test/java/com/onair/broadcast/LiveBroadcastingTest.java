package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** 송출 모듈을 interface(start, joinAsBroadcaster, relay, leave)로만 검증한다. 상대는 기록용 Peer다. */
class LiveBroadcastingTest extends ApiTestSupport {

    @Autowired
    LiveBroadcasting live;

    @Autowired
    JdbcTemplate jdbc;

    StartedLive 시작한다(String title) {
        return live.start(new StartLiveCommand(title, null));
    }

    LiveBroadcast 저장된_방송(StartedLive started) {
        return repository.findLiveById(started.broadcastId()).orElseThrow();
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
}

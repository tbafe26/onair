package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

/** 방 표를 interface로만 검증한다. DB도 Spring도 쓰지 않는다. */
class LiveRoomsTest {

    static final Instant T0 = Instant.parse("2026-01-01T00:00:00Z");

    static class StubPeer implements Peer {
        @Override
        public void send(SignalMessage message) { }

        @Override
        public void close() { }
    }

    @Test
    void 송출자를_등록하면_방이_열리고_조회된다() {
        LiveRooms rooms = new LiveRooms(2);
        Peer broadcaster = new StubPeer();

        rooms.registerBroadcaster(1, broadcaster, T0);

        assertThat(rooms.hasBroadcaster(1)).isTrue();
        assertThat(rooms.broadcasterOf(1)).containsSame(broadcaster);
        assertThat(rooms.broadcastIdOf(broadcaster)).contains(1L);
        assertThat(rooms.isConnected(broadcaster)).isTrue();
        assertThat(rooms.lastSignalOf(1)).contains(T0);
        assertThat(rooms.hasBroadcaster(2)).isFalse();
        assertThat(rooms.lastSignalOf(2)).isEmpty();
    }

    @Test
    void 시청자_자리는_상한까지만_내주고_번호는_서버가_부여한다() {
        LiveRooms rooms = new LiveRooms(2);
        rooms.registerBroadcaster(1, new StubPeer(), T0);
        Peer first = new StubPeer();
        Peer second = new StubPeer();

        String firstId = rooms.assignSeat(1, first).orElseThrow();
        String secondId = rooms.assignSeat(1, second).orElseThrow();

        assertThat(firstId).isNotEqualTo(secondId);
        assertThat(rooms.isFull(1)).isTrue();
        assertThat(rooms.assignSeat(1, new StubPeer())).isEmpty();
        assertThat(rooms.viewerCount(1)).isEqualTo(2);
        assertThat(rooms.viewerOf(1, firstId)).containsSame(first);
        assertThat(rooms.seatOf(second)).contains(new LiveRooms.Seat(1, secondId));
        assertThat(rooms.isConnected(first)).isTrue();
    }

    @Test
    void 방이_없으면_자리를_내주지_않는다() {
        LiveRooms rooms = new LiveRooms(2);

        assertThat(rooms.assignSeat(1, new StubPeer())).isEmpty();
        assertThat(rooms.viewerCount(1)).isZero();
        assertThat(rooms.viewerOf(1, null)).isEmpty();
    }

    @Test
    void 자리를_비우면_다시_앉을_수_있다() {
        LiveRooms rooms = new LiveRooms(1);
        rooms.registerBroadcaster(1, new StubPeer(), T0);
        Peer viewer = new StubPeer();
        String viewerId = rooms.assignSeat(1, viewer).orElseThrow();

        assertThat(rooms.releaseSeat(viewer)).contains(new LiveRooms.Seat(1, viewerId));

        assertThat(rooms.isFull(1)).isFalse();
        assertThat(rooms.isConnected(viewer)).isFalse();
        assertThat(rooms.viewerOf(1, viewerId)).isEmpty();
        assertThat(rooms.releaseSeat(viewer)).isEmpty();
        assertThat(rooms.assignSeat(1, new StubPeer())).isPresent();
    }

    @Test
    void 생존_신호는_마지막_시각으로_갱신된다() {
        LiveRooms rooms = new LiveRooms(1);
        rooms.registerBroadcaster(1, new StubPeer(), T0);

        rooms.recordHeartbeat(1, T0.plusSeconds(10));
        rooms.recordHeartbeat(2, T0.plusSeconds(10));

        assertThat(rooms.lastSignalOf(1)).contains(T0.plusSeconds(10));
        assertThat(rooms.lastSignalOf(2)).isEmpty();
    }

    @Test
    void 방을_닫으면_송출자와_자리가_모두_지워지고_남은_시청자를_돌려준다() {
        LiveRooms rooms = new LiveRooms(3);
        Peer broadcaster = new StubPeer();
        rooms.registerBroadcaster(1, broadcaster, T0);
        Peer first = new StubPeer();
        Peer second = new StubPeer();
        rooms.assignSeat(1, first);
        rooms.assignSeat(1, second);
        Peer otherBroadcaster = new StubPeer();
        rooms.registerBroadcaster(2, otherBroadcaster, T0);

        assertThat(rooms.closeRoom(1)).containsExactly(first, second);

        assertThat(rooms.hasBroadcaster(1)).isFalse();
        assertThat(rooms.isConnected(broadcaster)).isFalse();
        assertThat(rooms.isConnected(first)).isFalse();
        assertThat(rooms.seatOf(second)).isEmpty();
        assertThat(rooms.lastSignalOf(1)).isEmpty();
        assertThat(rooms.hasBroadcaster(2)).isTrue();
        assertThat(rooms.closeRoom(1)).isEmpty();
    }
}

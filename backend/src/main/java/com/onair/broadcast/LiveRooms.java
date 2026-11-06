package com.onair.broadcast;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 방 표: 방송 중인 라이브방송마다 송출자 연결, 시청자 자리, 마지막 생존 신호를 한곳에서 기억한다.
 * 메모리에만 있고 DB와 Spring을 모른다. 규칙(누구를 받을지)은 정하지 않고 사실만 기록한다.
 *
 * <p>스레드 안전하지 않다. LiveBroadcasting이 자기 잠금 안에서만 부르므로 따로 잠그지 않는다.
 */
final class LiveRooms {

    /** 시청자가 받은 자리. 시청자 번호는 서버가 부여한다. */
    record Seat(long broadcastId, String viewerId) { }

    private static final class Room {
        final Peer broadcaster;
        Instant lastSignal;
        final Map<String, Peer> viewers = new LinkedHashMap<>();

        Room(Peer broadcaster, Instant lastSignal) {
            this.broadcaster = broadcaster;
            this.lastSignal = lastSignal;
        }
    }

    private final int capacity;
    private final Map<Long, Room> rooms = new HashMap<>();
    // 연결 → 방송 id(송출자) / 자리(시청자). 연결은 객체 동일성으로 구분한다.
    private final Map<Peer, Long> broadcasterRooms = new IdentityHashMap<>();
    private final Map<Peer, Seat> seats = new IdentityHashMap<>();
    private long lastViewerNumber;

    LiveRooms(int capacity) {
        this.capacity = capacity;
    }

    /** 방마다 앉을 수 있는 시청자 수의 상한. */
    int capacity() {
        return capacity;
    }

    /** 송출자를 등록해 방을 연다. 호출자가 같은 방송에 송출자가 없음을 먼저 확인한다. */
    void registerBroadcaster(long broadcastId, Peer broadcaster, Instant now) {
        rooms.put(broadcastId, new Room(broadcaster, now));
        broadcasterRooms.put(broadcaster, broadcastId);
    }

    boolean hasBroadcaster(long broadcastId) {
        return rooms.containsKey(broadcastId);
    }

    Optional<Peer> broadcasterOf(long broadcastId) {
        return Optional.ofNullable(rooms.get(broadcastId)).map(room -> room.broadcaster);
    }

    /** 이 연결이 송출자인 방송 id. 송출자가 아니면 비어 있다. */
    Optional<Long> broadcastIdOf(Peer peer) {
        return Optional.ofNullable(broadcasterRooms.get(peer));
    }

    /** 송출자이거나 시청자인 연결인가. */
    boolean isConnected(Peer peer) {
        return broadcasterRooms.containsKey(peer) || seats.containsKey(peer);
    }

    boolean isFull(long broadcastId) {
        return viewerCount(broadcastId) >= capacity;
    }

    /** 방에 시청자 자리를 하나 내주고 부여한 시청자 번호를 돌려준다. 방이 없거나 가득 차면 비어 있다. */
    Optional<String> assignSeat(long broadcastId, Peer viewer) {
        Room room = rooms.get(broadcastId);
        if (room == null || room.viewers.size() >= capacity) {
            return Optional.empty();
        }
        String viewerId = String.valueOf(++lastViewerNumber);
        room.viewers.put(viewerId, viewer);
        seats.put(viewer, new Seat(broadcastId, viewerId));
        return Optional.of(viewerId);
    }

    Optional<Seat> seatOf(Peer viewer) {
        return Optional.ofNullable(seats.get(viewer));
    }

    Optional<Peer> viewerOf(long broadcastId, String viewerId) {
        Room room = rooms.get(broadcastId);
        return room == null || viewerId == null
                ? Optional.empty() : Optional.ofNullable(room.viewers.get(viewerId));
    }

    int viewerCount(long broadcastId) {
        Room room = rooms.get(broadcastId);
        return room == null ? 0 : room.viewers.size();
    }

    /** 시청자의 자리를 비우고 그 자리를 돌려준다. 시청자가 아니면 비어 있다. */
    Optional<Seat> releaseSeat(Peer viewer) {
        Seat seat = seats.remove(viewer);
        if (seat != null) {
            Room room = rooms.get(seat.broadcastId());
            if (room != null) {
                room.viewers.remove(seat.viewerId());
            }
        }
        return Optional.ofNullable(seat);
    }

    /** 송출자의 마지막 생존 신호 시각을 갱신한다. 방이 없으면 무시한다. */
    void recordHeartbeat(long broadcastId, Instant now) {
        Room room = rooms.get(broadcastId);
        if (room != null) {
            room.lastSignal = now;
        }
    }

    /** 송출자가 연결된 방송의 마지막 생존 신호 시각. 연결 전이면 비어 있다. */
    Optional<Instant> lastSignalOf(long broadcastId) {
        return Optional.ofNullable(rooms.get(broadcastId)).map(room -> room.lastSignal);
    }

    /** 방을 닫는다. 송출자 등록과 모든 자리를 지우고 남아 있던 시청자 연결을 돌려준다. 방이 없으면 빈 목록이다. */
    List<Peer> closeRoom(long broadcastId) {
        Room room = rooms.remove(broadcastId);
        if (room == null) {
            return List.of();
        }
        broadcasterRooms.remove(room.broadcaster);
        List<Peer> remaining = new ArrayList<>(room.viewers.values());
        remaining.forEach(seats::remove);
        return remaining;
    }
}

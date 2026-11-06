package com.onair.broadcast;

import com.onair.api.Requester;

/** 소유 방송 찾기. 로그인(401), 방송 존재(404), 소유자(403) 순으로 확인한다. */
public final class OwnedBroadcasts {

    private OwnedBroadcasts() {
    }

    /** userId는 요청한 사용자이고 로그인하지 않았으면 null이다. */
    public static Broadcast find(BroadcastRepository repository, long id, Long userId) {
        long requester = Requester.id(userId);
        Broadcast broadcast = repository.findById(id).orElseThrow(() -> new BroadcastNotFoundException(id));
        if (!broadcast.isOwnedBy(requester)) {
            throw new BroadcastForbiddenException(id);
        }
        return broadcast;
    }
}

package com.onair.broadcast;

import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Entity;
import java.time.Instant;

/**
 * 라이브방송: 송출 한 번이 방송 하나다. 등록 시각(createdAt)이 송출 시작 시각이다.
 * 상태는 방송 중에서 종료로만 바뀌고, 송출 키는 해시로만 가진다.
 */
@Entity
@DiscriminatorValue("LIVE")
public class LiveBroadcast extends Broadcast {

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private LiveStatus status;

    private Instant endedAt;

    @Column(nullable = false, length = 64)
    private String streamKeyHash;

    private String thumbnailKey;

    protected LiveBroadcast() {
    }

    LiveBroadcast(String title, String streamKeyHash, String thumbnailKey, Instant startedAt) {
        super(title, startedAt);
        this.status = LiveStatus.ON_AIR;
        this.streamKeyHash = streamKeyHash;
        this.thumbnailKey = thumbnailKey;
    }

    @Override
    public BroadcastKind getKind() {
        return BroadcastKind.LIVE;
    }

    LiveStatus status() {
        return status;
    }

    boolean isOnAir() {
        return status == LiveStatus.ON_AIR;
    }

    /** 종료 시각. 방송 중이면 null이다. */
    Instant endedAt() {
        return endedAt;
    }

    /** 송출 키가 이 방송의 것인지 시간 차가 드러나지 않게 비교한다. */
    boolean matchesStreamKey(String streamKey) {
        return StreamKeys.matches(streamKey, streamKeyHash);
    }

    /** 방송 중이면 종료로 바꾸고 true를 돌려준다. 이미 종료됐으면 아무것도 바꾸지 않고 false다. */
    boolean end(Instant now) {
        if (status == LiveStatus.ENDED) {
            return false;
        }
        status = LiveStatus.ENDED;
        endedAt = now;
        return true;
    }

    @Override
    String thumbnailKey() {
        return thumbnailKey;
    }
}

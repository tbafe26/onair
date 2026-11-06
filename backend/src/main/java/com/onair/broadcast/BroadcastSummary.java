package com.onair.broadcast;

import java.time.Instant;

/**
 * 목록 카드에 쓰는 방송 요약의 JSON 모양. 만드는 곳은 BroadcastResponses.
 * 종류마다 모양이 다르고, 썸네일이 없으면 thumbnailUrl이 null이다. 라이브방송의 createdAt은 송출 시작 시각이다.
 */
sealed interface BroadcastSummary {

    Long id();

    BroadcastKind kind();

    record Recording(
            Long id,
            BroadcastKind kind,
            String title,
            Instant createdAt,
            BroadcastOwner owner,
            Double durationSeconds,
            String thumbnailUrl) implements BroadcastSummary {
    }

    record Live(
            Long id,
            BroadcastKind kind,
            String title,
            Instant createdAt,
            BroadcastOwner owner,
            String thumbnailUrl,
            LiveStatus status) implements BroadcastSummary {
    }
}

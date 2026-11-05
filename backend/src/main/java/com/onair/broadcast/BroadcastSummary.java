package com.onair.broadcast;

import java.time.Instant;

/** 목록 카드에 쓰는 방송 요약의 JSON 모양. 만드는 곳은 BroadcastResponses. 썸네일이 없으면 thumbnailUrl이 null이다. */
record BroadcastSummary(
        Long id,
        BroadcastKind kind,
        String title,
        Instant createdAt,
        Double durationSeconds,
        String thumbnailUrl) {
}

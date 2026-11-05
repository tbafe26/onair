package com.onair.broadcast;

import java.time.Instant;

/** 방송 상세의 JSON 모양. 플레이어가 형식에 따라 소스를 고를 수 있도록 영상 형식을 함께 준다. 만드는 곳은 BroadcastResponses. */
record BroadcastDetail(
        Long id,
        BroadcastKind kind,
        String title,
        Instant createdAt,
        VideoInfo video) {

    record VideoInfo(
            String url,
            String contentType,
            long sizeBytes,
            Double durationSeconds,
            String thumbnailUrl) {
    }
}

package com.onair.broadcast;

import java.time.Instant;

/**
 * 방송 상세의 JSON 모양. 만드는 곳은 BroadcastResponses.
 * 녹화방송은 플레이어가 형식에 따라 소스를 고를 수 있도록 영상 형식을 함께 주고, 라이브방송은 영상 정보 대신 상태와 종료 시각을 준다.
 * 송출 키와 그 해시는 어느 쪽에도 없다.
 */
sealed interface BroadcastDetail {

    Long id();

    record Recording(
            Long id,
            BroadcastKind kind,
            String title,
            Instant createdAt,
            VideoInfo video) implements BroadcastDetail {
    }

    record VideoInfo(
            String url,
            String contentType,
            long sizeBytes,
            Double durationSeconds,
            String thumbnailUrl) {
    }

    record Live(
            Long id,
            BroadcastKind kind,
            String title,
            Instant createdAt,
            String thumbnailUrl,
            LiveStatus status,
            Instant endedAt) implements BroadcastDetail {
    }
}

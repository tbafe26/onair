package com.onair.broadcast;

/**
 * 방송을 응답 모양(요약, 상세)으로 바꾼다. 공통 항목을 채우고 구체 타입별 항목과 API 주소를 더한다.
 * Broadcast는 sealed로 두지 않으므로(Hibernate 지연 프록시), 모르는 타입은 default에서 예외로 막는다.
 */
final class BroadcastResponses {

    private static final String BASE_PATH = "/api/broadcasts/";

    private BroadcastResponses() {
    }

    /** 방송 하나의 API 주소. 등록 응답의 Location과 영상·썸네일 주소가 모두 여기서 나온다. */
    static String location(long id) {
        return BASE_PATH + id;
    }

    static BroadcastSummary summary(Broadcast broadcast) {
        return switch (broadcast) {
            case RecordingBroadcast r -> new BroadcastSummary.Recording(
                    r.getId(), r.getKind(), r.getTitle(), r.getCreatedAt(),
                    r.durationSeconds() == null ? null : r.durationSeconds().value(),
                    thumbnailUrl(r));
            case LiveBroadcast l -> new BroadcastSummary.Live(
                    l.getId(), l.getKind(), l.getTitle(), l.getCreatedAt(), thumbnailUrl(l), l.status());
            default -> throw unsupported(broadcast);
        };
    }

    static BroadcastDetail detail(Broadcast broadcast) {
        return switch (broadcast) {
            case RecordingBroadcast r -> new BroadcastDetail.Recording(
                    r.getId(), r.getKind(), r.getTitle(), r.getCreatedAt(),
                    new BroadcastDetail.VideoInfo(
                            location(r.getId()) + "/video",
                            r.videoFormat().mediaType(),
                            r.videoSizeBytes(),
                            r.durationSeconds() == null ? null : r.durationSeconds().value(),
                            thumbnailUrl(r)));
            case LiveBroadcast l -> new BroadcastDetail.Live(
                    l.getId(), l.getKind(), l.getTitle(), l.getCreatedAt(), thumbnailUrl(l),
                    l.status(), l.endedAt());
            default -> throw unsupported(broadcast);
        };
    }

    private static String thumbnailUrl(Broadcast broadcast) {
        return broadcast.thumbnailKey() == null ? null : location(broadcast.getId()) + "/thumbnail";
    }

    private static IllegalStateException unsupported(Broadcast broadcast) {
        return new IllegalStateException("응답으로 바꿀 수 없는 방송 종류입니다: " + broadcast.getClass());
    }
}

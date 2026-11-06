package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

/** 방송이 답하는 허용 규칙을 Spring 없이 확인한다. */
class BroadcastRulesTest {

    static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");

    static RecordingBroadcast recording(String thumbnailKey) {
        Video video = new Video("video-key", "v.mp4", VideoFormat.MP4, 10, null, thumbnailKey);
        return new RecordingBroadcast("녹화", video, NOW, null);
    }

    static LiveBroadcast live(String thumbnailKey) {
        return new LiveBroadcast("라이브", "hash", thumbnailKey, NOW, null);
    }

    @Test
    void 라이브방송만_송출_중일_수_있다() {
        LiveBroadcast live = live(null);
        assertThat(live.isOnAir()).isTrue();
        assertThat(recording(null).isOnAir()).isFalse();

        live.end(NOW);

        assertThat(live.isOnAir()).isFalse();
    }

    @Test
    void 녹화방송은_언제나_지울_수_있다() {
        assertThat(recording(null).canDeleteNow()).isTrue();
    }

    @Test
    void 방송_중인_라이브방송은_지울_수_없고_종료되면_지울_수_있다() {
        LiveBroadcast live = live(null);
        assertThat(live.canDeleteNow()).isFalse();

        live.end(NOW);

        assertThat(live.canDeleteNow()).isTrue();
    }

    @Test
    void 녹화방송은_언제나_댓글을_받는다() {
        assertThat(recording(null).acceptsCommentsNow()).isTrue();
    }

    @Test
    void 라이브방송은_방송_중일_때만_댓글을_받는다() {
        LiveBroadcast live = live(null);
        assertThat(live.acceptsCommentsNow()).isTrue();

        live.end(NOW);

        assertThat(live.acceptsCommentsNow()).isFalse();
    }

    @Test
    void 녹화방송_댓글은_지울_수_있고_라이브방송_채팅은_지울_수_없다() {
        assertThat(recording(null).commentsDeletable()).isTrue();
        assertThat(live(null).commentsDeletable()).isFalse();
    }

    @Test
    void 라이브방송만_채팅이다() {
        assertThat(live(null).isChat()).isTrue();
        assertThat(recording(null).isChat()).isFalse();
    }

    @Test
    void 라이브방송만_송출을_종료할_수_있다() {
        assertThat(live(null).canEndStream()).isTrue();
        assertThat(recording(null).canEndStream()).isFalse();
    }

    @Test
    void 녹화방송의_파일은_영상과_썸네일이다() {
        assertThat(recording("thumb-key").ownedFileKeys()).containsExactly("video-key", "thumb-key");
        assertThat(recording(null).ownedFileKeys()).containsExactly("video-key");
    }

    @Test
    void 라이브방송의_파일은_썸네일뿐이다() {
        assertThat(live("thumb-key").ownedFileKeys()).containsExactly("thumb-key");
        assertThat(live(null).ownedFileKeys()).isEmpty();
    }
}

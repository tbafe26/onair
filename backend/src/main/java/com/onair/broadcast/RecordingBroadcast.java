package com.onair.broadcast;

import jakarta.persistence.CascadeType;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import java.time.Instant;

/** 녹화방송: 영상 하나를 참조하는 방송. 영상 정보는 호출자가 구조를 따라가지 않도록 여기서 바로 묻는다. */
@Entity
@DiscriminatorValue("RECORDING")
public class RecordingBroadcast extends Broadcast {

    @OneToOne(fetch = FetchType.LAZY, cascade = CascadeType.PERSIST, optional = false)
    @JoinColumn(name = "video_id", nullable = false)
    private Video video;

    protected RecordingBroadcast() {
    }

    public RecordingBroadcast(String title, Video video, Instant createdAt) {
        super(title, createdAt);
        this.video = video;
    }

    @Override
    public BroadcastKind getKind() {
        return BroadcastKind.RECORDING;
    }

    VideoFormat videoFormat() {
        return video.getFormat();
    }

    long videoSizeBytes() {
        return video.getSizeBytes();
    }

    String videoStorageKey() {
        return video.getStorageKey();
    }

    /** 재생 시간. 보내지 않았으면 null이다. */
    DurationSeconds durationSeconds() {
        return video.getDurationSeconds();
    }

    boolean hasThumbnail() {
        return video.getThumbnailKey() != null;
    }

    /** 썸네일 저장 키. 썸네일이 없으면 null이다. */
    String thumbnailKey() {
        return video.getThumbnailKey();
    }
}

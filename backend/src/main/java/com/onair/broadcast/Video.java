package com.onair.broadcast;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

/**
 * 영상: 방송과 분리된 별도 엔티티. 파일 자체는 영상 저장소에 있고 여기에는 키와 메타데이터만 둔다.
 * 재생 시간과 썸네일은 등록 화면이 보낸 참고용 표시 정보다.
 */
@Entity
public class Video {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String storageKey;

    @Column(nullable = false)
    private String originalFilename;

    // DB에는 미디어 타입 문자열(video/mp4)로 저장한다.
    @Convert(converter = VideoFormatConverter.class)
    @Column(name = "content_type", nullable = false, length = 100)
    private VideoFormat format;

    @Column(nullable = false)
    private long sizeBytes;

    // DB에는 double 숫자로 저장한다. 등록 화면이 보내지 않았으면 null이다.
    @Convert(converter = DurationSecondsConverter.class)
    private DurationSeconds durationSeconds;

    private String thumbnailKey;

    protected Video() {
    }

    public Video(String storageKey, String originalFilename, VideoFormat format, long sizeBytes,
            DurationSeconds durationSeconds, String thumbnailKey) {
        this.storageKey = storageKey;
        this.originalFilename = originalFilename;
        this.format = format;
        this.sizeBytes = sizeBytes;
        this.durationSeconds = durationSeconds;
        this.thumbnailKey = thumbnailKey;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public VideoFormat getFormat() {
        return format;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public DurationSeconds getDurationSeconds() {
        return durationSeconds;
    }

    public String getThumbnailKey() {
        return thumbnailKey;
    }
}

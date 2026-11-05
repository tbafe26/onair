package com.onair.broadcast;

import java.util.Optional;

/** 올릴 수 있는 영상 형식. 파일 앞부분의 시그니처 바이트로 판정하고, 응답의 미디어 타입도 여기서 정한다. */
enum VideoFormat {

    MP4("video/mp4"),
    WEBM("video/webm");

    /** 시그니처 판정에 필요한 앞부분 바이트 수. */
    static final int SIGNATURE_LENGTH = 8;

    private final String mediaType;

    VideoFormat(String mediaType) {
        this.mediaType = mediaType;
    }

    String mediaType() {
        return mediaType;
    }

    /** 시그니처로 형식을 판정한다. mp4나 webm이 아니면 비어 있다. 확장자와 보낸 Content-Type은 보지 않는다. */
    static Optional<VideoFormat> detect(byte[] head) {
        // mp4: 4~7번째 바이트(0부터 셈)가 ftyp
        if (head.length >= 8 && head[4] == 'f' && head[5] == 't' && head[6] == 'y' && head[7] == 'p') {
            return Optional.of(MP4);
        }
        // webm: EBML 헤더 1A 45 DF A3
        if (head.length >= 4 && head[0] == 0x1A && head[1] == 0x45
                && head[2] == (byte) 0xDF && head[3] == (byte) 0xA3) {
            return Optional.of(WEBM);
        }
        return Optional.empty();
    }

    /** DB에 저장된 미디어 타입 문자열을 형식으로 되돌린다. */
    static VideoFormat fromMediaType(String mediaType) {
        for (VideoFormat format : values()) {
            if (format.mediaType.equals(mediaType)) {
                return format;
            }
        }
        throw new IllegalArgumentException("알 수 없는 영상 미디어 타입: " + mediaType);
    }
}

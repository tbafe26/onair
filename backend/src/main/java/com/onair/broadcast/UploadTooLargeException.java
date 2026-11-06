package com.onair.broadcast;

/** 영상이 업로드 크기 상한을 넘었다. 413으로 응답하고, 본문의 상한 값은 여기서 가져간다. */
class UploadTooLargeException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final long maxBytes;

    UploadTooLargeException(long maxBytes) {
        super("업로드 크기 상한을 넘었습니다: " + maxBytes);
        this.maxBytes = maxBytes;
    }

    long maxBytes() {
        return maxBytes;
    }
}

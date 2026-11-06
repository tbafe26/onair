package com.onair.api;

/** 영상이 업로드 크기 상한을 넘었다. 413으로 응답하고, 본문의 상한 값은 여기서 가져간다. */
public class UploadTooLargeException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final long maxBytes;

    public UploadTooLargeException(long maxBytes) {
        super("업로드 크기 상한을 넘었습니다: " + maxBytes);
        this.maxBytes = maxBytes;
    }

    public long maxBytes() {
        return maxBytes;
    }
}

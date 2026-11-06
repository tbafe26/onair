package com.onair.broadcast;

/** 방송은 있지만 저장소에서 파일(영상 또는 썸네일)이 사라졌다. 404로 응답한다. */
class MediaFileMissingException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    MediaFileMissingException(long broadcastId) {
        super("방송 " + broadcastId + "의 저장된 파일을 찾을 수 없습니다");
    }
}

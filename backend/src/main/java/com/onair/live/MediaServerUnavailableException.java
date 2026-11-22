package com.onair.live;

/** 미디어 서버에 묻지 못했다. 송출 상태를 알 수 없다는 뜻이지 송출이 없다는 뜻이 아니다. */
class MediaServerUnavailableException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    MediaServerUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}

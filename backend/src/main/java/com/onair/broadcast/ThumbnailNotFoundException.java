package com.onair.broadcast;

/** 방송은 있지만 썸네일이 없다. ApiExceptionHandler가 404 ProblemDetail로 바꾼다. */
class ThumbnailNotFoundException extends RuntimeException {

    ThumbnailNotFoundException(long id) {
        super("이 방송에는 썸네일이 없습니다: " + id);
    }
}
